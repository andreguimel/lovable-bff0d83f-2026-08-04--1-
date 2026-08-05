// Public webhook receiver para instâncias Stevo (engine SM v2).
// URL: /api/public/webhooks/stevo/:channelId?token=<webhook_verify_token>
//
// A Stevo não assina os webhooks, então a autenticidade é garantida por um
// token opaco por canal (`channels.webhook_verify_token`), aceito na query
// `?token=` ou no header `x-webhook-token`.
//
// Rebuild marker: 2026-08-01T15:55Z — redeploy para reinjetar SUPABASE_SERVICE_ROLE_KEY.
import { createFileRoute } from "@tanstack/react-router";

import { resumeWaitingReplyForConversation } from "@/lib/flow-resume-inbound.server";
import { startWelcomeFlowForNewContact } from "@/lib/flow-welcome-inbound.server";
import {
  findOrCreateCanonicalContact,
  findOrCreateLogicalConversation,
  stopReengagementCascades,
} from "@/lib/identity/canonical.server";
import { triggerAgentReply } from "@/lib/inbound-agent.server";
import { normalizeStevoWebhook } from "@/lib/wa-providers/stevo-inbound.server";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/webhooks/stevo/$channelId")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),

      POST: async ({ request, params }) => {
        try {
        const raw = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: channel } = await supabaseAdmin
          .from("channels")
          .select(
            "id, company_id, provider_type, credentials, phone_number, ai_agent_id, webhook_verify_token, default_welcome_flow_id",
          )
          .eq("id", params.channelId)
          .maybeSingle();
        if (!channel || channel.provider_type !== "stevo") {
          return new Response("Canal não encontrado", { status: 404 });
        }

        const url = new URL(request.url);
        const provided = url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
        if (channel.webhook_verify_token) {
          if (!provided || !timingSafeEqual(provided, channel.webhook_verify_token)) {
            await supabaseAdmin.from("channel_events").insert({
              company_id: channel.company_id,
              channel_id: channel.id,
              event_type: "webhook_received" as never,
              payload: { reason: "invalid_token", provider: "stevo" },
            });
            return new Response("Invalid token", { status: 401 });
          }
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const { inbound, statuses } = normalizeStevoWebhook(payload);

        // Log do payload completo para diagnóstico
        const rawPayloadStr = raw.length > 5000 ? raw.slice(0, 5000) + "...[truncated]" : raw;
        await supabaseAdmin.from("channel_events").insert({
          company_id: channel.company_id,
          channel_id: channel.id,
          event_type: "webhook_received",
          payload: {
            provider: "stevo",
            inbound: inbound.length,
            statuses: statuses.length,
            type: (payload as { type?: string })?.type ?? null,
            raw_payload: rawPayloadStr,
          },
        });

        for (const msg of inbound) {
          const rawPhone = msg.from_phone.startsWith("+") ? msg.from_phone : `+${msg.from_phone}`;

          let contactId: string;
          let isNewContact = false;
          try {
            const c = await findOrCreateCanonicalContact(supabaseAdmin, {
              companyId: channel.company_id,
              rawPhone,
              name: msg.contact_name ?? null,
            });
            contactId = c.contactId;
            isNewContact = c.isNew;
          } catch {
            continue;
          }

          let conversationId: string;
          try {
            const conv = await findOrCreateLogicalConversation(supabaseAdmin, {
              companyId: channel.company_id,
              contactId,
              originChannelId: channel.id,
              aiAgentId: channel.ai_agent_id ?? null,
            });
            conversationId = conv.conversationId;
          } catch {
            continue;
          }

          // Idempotência inbound (pré-checagem barata)
          const { data: existing } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("provider_message_id", msg.provider_message_id)
            .maybeSingle();
          if (existing) continue;

          const preview =
            msg.type === "text"
              ? (msg.body ?? "").slice(0, 120)
              : msg.type === "image"
                ? "📷 Imagem"
                : msg.type === "audio"
                  ? "🎤 Áudio"
                  : msg.type === "video"
                    ? "🎬 Vídeo"
                    : "📎 Arquivo";

          let replyToId: string | null = null;
          if (msg.reply_to_provider_id) {
            const { data: quoted } = await supabaseAdmin
              .from("messages")
              .select("id")
              .eq("conversation_id", conversationId)
              .eq("provider_message_id", msg.reply_to_provider_id)
              .maybeSingle();
            if (quoted) replyToId = quoted.id;
          }

          // Mídia recebida vem criptografada (`.enc` em mmg.whatsapp.net) e não
          // pode ser exibida direto no browser: baixamos, descriptografamos e
          // guardamos no bucket `message-media`.
          let storedMediaUrl = msg.media_url ?? null;
          if (msg.type !== "text" && msg.media_url) {
            const { persistInboundWhatsAppMedia } = await import("@/lib/wa-providers/whatsapp-media.server");
            const path = await persistInboundWhatsAppMedia(supabaseAdmin as never, {
              companyId: channel.company_id,
              kind: msg.type,
              mediaUrl: msg.media_url,
              metadata: msg.media_metadata,
            });
            if (path) storedMediaUrl = path;
          }

          // Insert atômico: o índice único parcial garante que apenas UMA
          // entrega concorrente do mesmo evento siga adiante (evita resposta
          // duplicada do agente/fluxo quando o provedor reenvia o webhook).
          const isOutboundFromPhone = msg.from_me === true;

          const { data: insertedMsg, error: insertErr } = await supabaseAdmin
            .from("messages")
            .insert({
              company_id: channel.company_id,
              conversation_id: conversationId,
              channel_id: channel.id,
              direction: isOutboundFromPhone ? "outbound" : "inbound",
              type: msg.type,
              body: msg.body ?? null,
              media_url: storedMediaUrl,
              media_metadata: (msg.media_metadata as never) ?? null,
              provider_message_id: msg.provider_message_id,
              reply_to_id: replyToId,
              status: "delivered",
            })
            .select("id")
            .single();

          if (insertErr) continue; // duplicata (23505) ou falha — não reprocessa
          const messageId = insertedMsg?.id ?? null;

          const { data: convStat } = await supabaseAdmin
            .from("conversations")
            .select("unread_count")
            .eq("id", conversationId)
            .maybeSingle();

          await supabaseAdmin
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: preview,
              unread_count: isOutboundFromPhone
                ? (convStat?.unread_count ?? 0)
                : (convStat?.unread_count ?? 0) + 1,
            })
            .eq("id", conversationId);

          await supabaseAdmin
            .from("contacts")
            .update({
              last_inbound_channel_id: channel.id,
              last_interaction_at: new Date().toISOString(),
            })
            .eq("id", contactId);

          if (isOutboundFromPhone) continue;

          if (messageId) {
            try {
              await stopReengagementCascades(supabaseAdmin, {
                companyId: channel.company_id,
                contactId,
                replyMessageId: messageId,
                replyChannelId: channel.id,
              });
            } catch {
              // best-effort
            }
          }

          const { data: pauseRow } = await supabaseAdmin
            .from("conversations")
            .select("bot_paused_until")
            .eq("id", conversationId)
            .maybeSingle();
          const botPaused =
            !!pauseRow?.bot_paused_until &&
            new Date(pauseRow.bot_paused_until as string).getTime() > Date.now();

          let flowResumed = false;
          if (!botPaused) {
            try {
              const resumeRes = await resumeWaitingReplyForConversation({
                supabase: supabaseAdmin,
                companyId: channel.company_id,
                channelId: channel.id,
                conversationId,
                replyMessage: {
                  provider_message_id: msg.provider_message_id,
                  type: msg.type,
                  body: msg.body ?? null,
                  media_url: storedMediaUrl ?? msg.media_url ?? null,
                  from_phone: rawPhone,
                },
              });
              flowResumed = resumeRes.resumed;
            } catch (e) {
              await supabaseAdmin.from("channel_events").insert({
                company_id: channel.company_id,
                channel_id: channel.id,
                event_type: "webhook_received" as never,
                payload: {
                  reason: "flow_resume_failed",
                  conversation_id: conversationId,
                  error: String((e as Error).message ?? e),
                },
              });
            }
          }

          // Welcome flow do canal — só para contato novo e sem run em aberto.
          if (!flowResumed && !botPaused) {
            try {
              const welcome = await startWelcomeFlowForNewContact({
                supabase: supabaseAdmin,
                companyId: channel.company_id,
                channelId: channel.id,
                conversationId,
                contactId,
                welcomeFlowId: channel.default_welcome_flow_id,
                isNewContact,
                message: {
                  provider_message_id: msg.provider_message_id,
                  type: msg.type,
                  body: msg.body ?? null,
                  from_phone: rawPhone,
                },
              });
              flowResumed = welcome.started;
            } catch (e) {
              await supabaseAdmin.from("channel_events").insert({
                company_id: channel.company_id,
                channel_id: channel.id,
                event_type: "webhook_received" as never,
                payload: {
                  reason: "welcome_flow_failed",
                  conversation_id: conversationId,
                  error: String((e as Error).message ?? e),
                },
              });
            }
          }



          if (!flowResumed && !botPaused) {
            try {
              const { data: convAssign } = await supabaseAdmin
                .from("conversations")
                .select("assigned_type, assigned_agent_id, status")
                .eq("id", conversationId)
                .maybeSingle();
              if (
                convAssign?.assigned_type === "ai_agent" &&
                convAssign.assigned_agent_id &&
                convAssign.status !== "resolved"
              ) {
                await triggerAgentReply({
                  supabaseAdmin,
                  companyId: channel.company_id,
                  conversationId,
                  agentId: convAssign.assigned_agent_id,
                  channel: {
                    id: channel.id,
                    provider_type: channel.provider_type,
                    credentials: (channel.credentials ?? {}) as Record<string, unknown>,
                    phone_number: channel.phone_number,
                  },
                  toPhone: rawPhone,
                  inboundMessageId: messageId,
                });
              }
            } catch {
              // best-effort
            }
          }
        }

        for (const s of statuses) {
          await supabaseAdmin
            .from("messages")
            .update({ status: s.status })
            .eq("provider_message_id", s.provider_message_id);
        }

        return new Response("ok", { status: 200 });
        } catch (e) {
          const detail = String((e as Error)?.message ?? e);
          console.error("[stevo-webhook] erro", e);
          return new Response(`Erro ao processar webhook: ${detail}`, { status: 500 });
        }
      },
    },
  },
});
