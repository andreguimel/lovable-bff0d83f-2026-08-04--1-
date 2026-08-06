import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGuardianModel } from "@/lib/ai-provider.server";

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
];

// ---------- Draft (IA gera / revisa e-mail) ----------
export const draftEmailFromConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      instruction?: string;
      currentDraft?: { subject: string; body: string };
    }) =>
      z
        .object({
          conversationId: z.string().uuid(),
          instruction: z.string().max(2000).optional(),
          currentDraft: z
            .object({ subject: z.string(), body: z.string() })
            .optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {

    // Contexto: conversa, contato, canal, atendente
    const { data: conv, error: convErr } = await context.supabase
      .from("conversations")
      .select(
        "id, company_id, contact:contacts(name, phone, email), channel:channels!channel_id(name)",
      )
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversa não encontrada");

    const { data: msgs, error: msgErr } = await context.supabase
      .from("messages")
      .select("direction, type, body, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (msgErr) throw new Error(msgErr.message);
    if (!msgs || msgs.length === 0)
      throw new Error("A conversa ainda não tem mensagens para a IA analisar");

    const { data: me } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const contact = conv.contact as { name?: string; email?: string } | null;
    const channel = conv.channel as { name?: string } | null;

    const transcript = msgs
      .map((m) => {
        const who = m.direction === "inbound" ? contact?.name ?? "Lead" : "Atendente";
        const body = m.type === "text" ? (m.body ?? "") : `[${m.type}]`;
        return `${who}: ${body}`;
      })
      .join("\n");

    const systemPrompt = `Você é um assistente que compõe e-mails profissionais em português do Brasil a partir de conversas de WhatsApp.
Regras:
- Assunto claro e direto (idealmente até 60 caracteres).
- Corpo curto, em parágrafos separados por linhas em branco, tom compatível com a última mensagem do lead.
- Sem emojis excessivos. Sem markdown. Sem HTML.
- Comece com uma saudação usando o primeiro nome do lead quando disponível.
- Termine com uma assinatura genérica: "Equipe ${channel?.name ?? "Atendimento"}" ou o nome do atendente.
- Responda APENAS um JSON válido no formato {"subject":"...","body":"..."} sem texto adicional.`;

    const userParts: string[] = [
      `Lead: ${contact?.name ?? "sem nome"}${contact?.email ? ` <${contact.email}>` : ""}`,
      `Canal: ${channel?.name ?? "-"}`,
      `Atendente: ${me?.full_name ?? "-"}`,
      "",
      "Conversa recente:",
      transcript,
    ];

    if (data.currentDraft && data.instruction) {
      userParts.push(
        "",
        "Rascunho atual:",
        `Assunto: ${data.currentDraft.subject}`,
        `Corpo:\n${data.currentDraft.body}`,
        "",
        `Instrução do usuário para revisar o rascunho: ${data.instruction}`,
      );
    } else if (data.instruction) {
      userParts.push("", `Instrução extra: ${data.instruction}`);
    } else {
      userParts.push(
        "",
        "Gere um e-mail resumindo o assunto tratado e propondo o próximo passo natural.",
      );
    }

    const { model } = await buildGuardianModel(context.supabase, conv.company_id);

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userParts.join("\n"),
    });

    let parsed: { subject?: string; body?: string } = {};
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        parsed = JSON.parse(result.text);
      }
    } catch {
      parsed = { subject: "Assunto", body: result.text };
    }

    return {
      subject: parsed.subject ?? "Contato comercial",
      body: parsed.body ?? result.text,
    };
  });

// ---------- Envio via Resend ----------
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyToHtml(body: string) {
  return body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;line-height:1.55;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      to: string;
      subject: string;
      body: string;
      attachments?: Array<{ filename: string; contentType: string; base64: string }>;
    }) =>
      z
        .object({
          conversationId: z.string().uuid(),
          to: z.string().email(),
          subject: z.string().min(1).max(200),
          body: z.string().min(1).max(20000),
          attachments: z
            .array(
              z.object({
                filename: z.string().min(1).max(255),
                contentType: z.string().min(1).max(120),
                base64: z.string().min(1),
              }),
            )
            .max(10)
            .optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!resendKey || !from) {
      const err = new Error(
        "Resend não configurado. Adicione RESEND_API_KEY e RESEND_FROM_EMAIL em Configurações → APIs.",
      );
      (err as Error & { code?: string }).code = "resend_not_configured";
      throw err;
    }

    // Validação de anexos
    let totalBytes = 0;
    for (const att of data.attachments ?? []) {
      if (!ALLOWED_MIME.includes(att.contentType)) {
        throw new Error(`Tipo de arquivo não permitido: ${att.contentType}`);
      }
      const size = Math.floor((att.base64.length * 3) / 4);
      if (size > 10 * 1024 * 1024)
        throw new Error(`Anexo "${att.filename}" ultrapassa 10 MB.`);
      totalBytes += size;
    }
    if (totalBytes > 20 * 1024 * 1024)
      throw new Error("O total de anexos ultrapassa 20 MB.");

    // Escopo por company_id
    const { data: conv, error: convErr } = await context.supabase
      .from("conversations")
      .select("id, company_id, contact_id, channel_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversa não encontrada");

    // Envio Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from,
        to: [data.to],
        subject: data.subject,
        text: data.body,
        html: bodyToHtml(data.body),
        attachments: (data.attachments ?? []).map((a) => ({
          filename: a.filename,
          content: a.base64,
        })),
      }),
    });

    if (!resendRes.ok) {
      const raw = await resendRes.text();
      const status = resendRes.status;
      const map: Record<number, string> = {
        401: "Chave Resend inválida — verifique RESEND_API_KEY.",
        403: "Domínio remetente não verificado no Resend.",
        422: "Payload inválido para o Resend.",
        429: "Limite de envio Resend atingido — tente novamente em instantes.",
      };
      throw new Error(map[status] ?? `Falha no Resend (${status}): ${raw.slice(0, 240)}`);
    }
    const resendData = (await resendRes.json()) as { id?: string };

    // Registrar mensagem outbound + evento
    const preview = `📧 E-mail enviado — ${data.subject}`.slice(0, 120);
    await context.supabase.from("messages").insert({
      company_id: conv.company_id,
      conversation_id: data.conversationId,
      direction: "outbound",
      type: "text",
      body: `📧 E-mail enviado\nPara: ${data.to}\nAssunto: ${data.subject}\n\n${data.body}`,
      sender_user_id: context.userId,
      status: "sent",
    });

    await context.supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
      })
      .eq("id", data.conversationId);

    // Registra evento na timeline unificada
    await context.supabase.from("channel_events").insert({
      company_id: conv.company_id,
      channel_id: conv.channel_id ?? null,
      contact_id: conv.contact_id,
      conversation_id: data.conversationId,
      event_type: "email_sent",
      payload: {
        to: data.to,
        subject: data.subject,
        attachments_count: data.attachments?.length ?? 0,
        resend_id: resendData.id ?? null,
      },
    });

    return { ok: true, resendId: resendData.id ?? null };
  });
