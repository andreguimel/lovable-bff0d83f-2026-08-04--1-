import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGuardianModel } from "@/lib/ai-provider.server";

// ============ TAREFAS ============

export const listContactTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string }) =>
    z.object({ contactId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contact_tasks")
      .select("id, title, description, priority, status, due_at, assignee_id, parent_id, completed_at, created_at")
      .eq("contact_id", data.contactId)
      .order("status", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const taskInput = z.object({
  contactId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  due_at: z.string().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
});

export const createContactTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof taskInput>) => taskInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase
      .from("contacts")
      .select("company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!c) throw new Error("Contato não encontrado");
    const { data: row, error } = await context.supabase
      .from("contact_tasks")
      .insert({
        company_id: c.company_id,
        contact_id: data.contactId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        due_at: data.due_at ?? null,
        parent_id: data.parent_id ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateContactTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    id: string;
    title?: string;
    status?: "open" | "done";
    priority?: "low" | "medium" | "high";
    due_at?: string | null;
  }) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(200).optional(),
        status: z.enum(["open", "done"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        due_at: z.string().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.due_at !== undefined) patch.due_at = data.due_at;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.completed_at = data.status === "done" ? new Date().toISOString() : null;
    }
    const { error } = await context.supabase.from("contact_tasks").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContactTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contact_tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ NOTAS ============

export const listContactNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string }) =>
    z.object({ contactId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contact_notes")
      .select("id, body, pinned, created_at, updated_at, created_by")
      .eq("contact_id", data.contactId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createContactNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string; body: string }) =>
    z.object({ contactId: z.string().uuid(), body: z.string().min(1).max(8000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase
      .from("contacts")
      .select("company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!c) throw new Error("Contato não encontrado");
    const { data: row, error } = await context.supabase
      .from("contact_notes")
      .insert({
        company_id: c.company_id,
        contact_id: data.contactId,
        body: data.body,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateContactNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; body?: string; pinned?: boolean }) =>
    z
      .object({
        id: z.string().uuid(),
        body: z.string().max(8000).optional(),
        pinned: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.body !== undefined) patch.body = data.body;
    if (data.pinned !== undefined) patch.pinned = data.pinned;
    const { error } = await context.supabase.from("contact_notes").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContactNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contact_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ IA — Insights ============

type AIInsights = {
  summary?: string;
  sentiment?: "positivo" | "neutro" | "negativo";
  interest?: "alto" | "médio" | "baixo";
  objections?: string[];
  probability?: number;
  best_time?: string;
  next_action?: string;
  suggested_reply?: string;
  risk?: string;
  generated_at?: string;
};

export const generateContactAIInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string }) =>
    z.object({ contactId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<AIInsights> => {
    const { data: contact } = await context.supabase
      .from("contacts")
      .select("id, name, company_name, job_title, notes, funnel_stage, lead_score, company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!contact) throw new Error("Contato não encontrado");

    const { data: msgs } = await context.supabase
      .from("messages")
      .select("direction, body, created_at, conversation_id, conversations!inner(contact_id)")
      .eq("conversations.contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(30);

    const conversation = (msgs ?? [])
      .reverse()
      .map((m) => `${m.direction === "inbound" ? "Cliente" : "Empresa"}: ${m.body ?? ""}`)
      .join("\n")
      .slice(0, 6000);

    const prompt = `Você é um analista comercial sênior. Analise o histórico do cliente abaixo e devolva um JSON com os campos:
summary (resumo em 2 frases), sentiment (positivo|neutro|negativo), interest (alto|médio|baixo),
objections (array de strings curtas), probability (0-100), best_time (texto curto),
next_action (próxima ação sugerida), suggested_reply (mensagem pronta em português),
risk (fator de risco em 1 frase).

Cliente: ${contact.name}${contact.company_name ? " — " + contact.company_name : ""}${contact.job_title ? " (" + contact.job_title + ")" : ""}
Estágio no funil: ${contact.funnel_stage ?? "não definido"}
Notas internas: ${contact.notes ?? "—"}

Histórico recente:
${conversation || "Sem mensagens ainda."}

Responda APENAS com o JSON, sem markdown.`;

    const { model } = await buildGuardianModel(context.supabase, contact.company_id);
    const result = await generateText({
      model,
      prompt,
    });

    let parsed: AIInsights = {};
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : JSON.parse(result.text);
    } catch {
      parsed = { summary: result.text.slice(0, 300) };
    }
    parsed.generated_at = new Date().toISOString();

    await context.supabase
      .from("contacts")
      .update({ ai_insights: parsed })
      .eq("id", data.contactId);

    return parsed;
  });

// ============ IA — Ações rápidas ============

const quickAIActions = [
  "resumir",
  "proposta",
  "responder",
  "email",
  "tarefa",
  "followup",
  "analisar",
  "contrato",
  "objecoes",
] as const;
type QuickAIAction = (typeof quickAIActions)[number];

const promptMap: Record<QuickAIAction, string> = {
  resumir: "Resuma o contato em 3 bullets objetivos.",
  proposta: "Gere um esboço de proposta comercial personalizada para este cliente.",
  responder: "Sugira 3 possíveis respostas curtas para a última mensagem do cliente.",
  email: "Escreva um e-mail profissional em português para este cliente.",
  tarefa: "Sugira 3 tarefas concretas de follow-up para este cliente.",
  followup: "Escreva uma mensagem de follow-up amigável e não invasiva.",
  analisar: "Analise o lead: pontos fortes, riscos, próximos passos.",
  contrato: "Estruture os tópicos principais para um contrato com este cliente.",
  objecoes: "Liste possíveis objeções deste cliente e como respondê-las.",
};

export const runQuickAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string; action: QuickAIAction; extraContext?: string }) =>
    z
      .object({
        contactId: z.string().uuid(),
        action: z.enum(quickAIActions),
        extraContext: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: contact } = await context.supabase
      .from("contacts")
      .select("name, company_name, job_title, notes, funnel_stage, company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!contact) throw new Error("Contato não encontrado");

    const { data: msgs } = await context.supabase
      .from("messages")
      .select("direction, body, created_at, conversations!inner(contact_id)")
      .eq("conversations.contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(15);

    const conversation = (msgs ?? [])
      .reverse()
      .map((m) => `${m.direction === "inbound" ? "Cliente" : "Empresa"}: ${m.body ?? ""}`)
      .join("\n")
      .slice(0, 3000);

    const prompt = `Você é um assistente comercial sênior. Cliente: ${contact.name}${
      contact.company_name ? " — " + contact.company_name : ""
    }.
Notas: ${contact.notes ?? "—"}
Estágio: ${contact.funnel_stage ?? "—"}

Histórico recente:
${conversation || "Sem mensagens ainda."}

${data.extraContext ? `Contexto extra: ${data.extraContext}\n` : ""}
Tarefa: ${promptMap[data.action]}

Responda em português, de forma prática e pronta para copiar.`;

    const { model } = await buildGuardianModel(context.supabase, contact.company_id);
    const result = await generateText({
      model,
      prompt,
    });
    return { text: result.text.trim() };
  });

// ============ ARQUIVOS ============

export const listContactFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { contactId: string }) =>
    z.object({ contactId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: files, error } = await context.supabase.storage
      .from("contact-files")
      .list(data.contactId, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    const items = files ?? [];
    const withUrls = await Promise.all(
      items.map(async (f) => {
        const path = `${data.contactId}/${f.name}`;
        const { data: signed } = await context.supabase.storage
          .from("contact-files")
          .createSignedUrl(path, 60 * 60);
        return {
          name: f.name,
          path,
          size: f.metadata?.size as number | undefined,
          mime: (f.metadata?.mimetype as string | undefined) ?? "application/octet-stream",
          created_at: f.created_at,
          url: signed?.signedUrl ?? null,
        };
      }),
    );
    return withUrls;
  });

export const deleteContactFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { path: string }) =>
    z.object({ path: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.storage.from("contact-files").remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
