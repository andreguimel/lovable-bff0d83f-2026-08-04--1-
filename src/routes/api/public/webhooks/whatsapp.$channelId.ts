// Public webhook receiver for WhatsApp Cloud API.
// URL: /api/public/webhooks/whatsapp/:channelId
//
// GET  -> Meta verification handshake (hub.mode=subscribe, hub.verify_token, hub.challenge)
// POST -> incoming messages / status callbacks. Signed with X-Hub-Signature-256.
//
// ZENDA CORE ALIGNMENT 01 (2026-07):
//  - Contact identity resolvido pelo helper canônico (E.164) — 1 contact por número, cross-canal.
//  - Conversation lookup por (company, contact) — NÃO por channel. 1 atendimento lógico por contato.
//  - Cada mensagem inbound registra `channel_id` para preservar atribuição do canal receptor.
//  - Atualiza `contacts.last_inbound_channel_id` para continuidade da resposta.
//  - STOP-ON-REPLY: aciona `stopReengagementCascades` correlacionado por (company, contact).
import { createFileRoute } from "@tanstack/react-router";

import { triggerAgentReply } from "@/lib/inbound-agent.server";
import { resumeWaitingReplyForConversation } from "@/lib/flow-resume-inbound.server";
import { startWelcomeFlowForNewContact } from "@/lib/flow-welcome-inbound.server";
import {
  findOrCreateCanonicalContact,
  findOrCreateLogicalConversation,
  stopReengagementCascades,
} from "@/lib/identity/canonical.server";
import {
  normalizeMetaWebhook,
  verifyMetaSignature,
  type WhatsAppCloudCreds,
} from "@/lib/wa-providers/whatsapp-cloud.server";

export const Route = createFileRoute("/api/public/webhooks/whatsapp/$channelId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ch } = await supabaseAdmin
          .from("channels")
          .select("id, webhook_verify_token")
          .eq("id", params.channelId)
          .maybeSingle();
        if (!ch) return new Response("Canal não encontrado", { status: 404 });

        if (mode === "subscribe" && token && ch.webhook_verify_token && token === ch.webhook_verify_token) {
          return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Verify failed", { status: 403 });
      },

      POST: async ({ request, params }) => {
        const raw = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: channel } = await supabaseAdmin
          .from("channels")
          .select("id, company_id, provider_type, credentials, phone_number, ai_agent_id, auto_reply_enabled, default_welcome_flow_id")
          .eq("id", params.channelId)
          .maybeSingle();
        if (!channel) return new Response("Canal não encontrado", { status: 404 });

        const creds = (channel.credentials ?? {}) as WhatsAppCloudCreds;
        const sig = request.headers.get("x-hub-signature-256");

        // SECURITY (M2.1 F-M2-01): signature verification is MANDATORY.
        // Without it, any anonymous caller could spoof inbound messages,
        // poison contacts/conversations, and trigger outbound WhatsApp sends
        // (burning AI credits). A channel with no app_secret configured
        // rejects all POSTs until the operator sets it.
        if (!creds.app_secret) {
          await supabaseAdmin.from("channel_events").insert({
            company_id: channel.company_id,
            channel_id: channel.id,
            event_type: "webhook_received" as never,
            payload: { reason: "missing_app_secret" },
          });
          return new Response("Webhook not configured", { status: 401 });
        }
        if (!verifyMetaSignature(raw, sig, creds.app_secret)) {
          await supabaseAdmin.from("channel_events").insert({
            company_id: channel.company_id,
            channel_id: channel.id,
            event_type: "webhook_received" as never,
            payload: { reason: "invalid_signature" },
          });
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Audit event
        await supabaseAdmin.from("channel_events").insert({
          company_id: channel.company_id,
          channel_id: channel.id,
          event_type: "webhook_received",
          payload: { object: (payload as { object?: string })?.object ?? null },
        });

        const { inbound, statuses } = await normalizeMetaWebhook(payload, creds);

        // Handle inbound — canonical identity + unified conversation + stop-on-reply
        for (const msg of inbound) {
          const rawPhone = msg.from_phone.startsWith("+") ? msg.from_phone : `+${msg.from_phone}`;

          // 1) CANONICAL CONTACT (E.164, 1 por número, cross-canal)
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

          // 2) LOGICAL CONVERSATION (1 por contato, canal registrado por mensagem)
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

          // 3) Idempotência inbound: mesmo provider_message_id na mesma conversa não duplica
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

          // Resolve reply/quote (context.id from Meta) to a local message id.
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

          // 4) INSERT atômico (índice único parcial evita duplicatas concorrentes)
          const { data: insertedMsg, error: insertErr } = await supabaseAdmin
            .from("messages")
            .insert({
              company_id: channel.company_id,
              conversation_id: conversationId,
              channel_id: channel.id,
              direction: "inbound",
              type: msg.type,
              body: msg.body ?? null,
              media_url: msg.media_url ?? null,
              media_metadata: (msg.media_metadata as never) ?? null,
              provider_message_id: msg.provider_message_id,
              reply_to_id: replyToId,
              status: "delivered",
            })
            .select("id")
            .single();

          if (insertErr) continue; // duplicata (23505) — não reprocessa fluxos/agente
          const messageId = insertedMsg?.id ?? null;

          // 5) Atualiza preview/unread da conversa + last_inbound_channel do contato
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
              unread_count: (convStat?.unread_count ?? 0) + 1,
            })
            .eq("id", conversationId);

          await supabaseAdmin
            .from("contacts")
            .update({
              last_inbound_channel_id: channel.id,
              last_interaction_at: new Date().toISOString(),
            })
            .eq("id", contactId);

          // 6) STOP-ON-REPLY correlacionado — interrompe SOMENTE cascatas do contato,
          //    preservando flows e broadcasts.
          if (messageId) {
            try {
              await stopReengagementCascades(supabaseAdmin, {
                companyId: channel.company_id,
                contactId,
                replyMessageId: messageId,
                replyChannelId: channel.id,
              });
            } catch {
              // best-effort — nunca deve bloquear o webhook
            }
          }

          // 7) Retomada de flow pausado em wait_reply, se houver
          //    Se a automação estiver pausada pelo usuário, ignora fluxo e agente.
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
                  media_url: msg.media_url ?? null,
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

          // 7.1) Welcome flow do canal — contato novo, nenhum run em aberto
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

          // 8) AI agent auto-reply se nada assumiu e não estiver pausado
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

        // Handle status callbacks (delivered / read / failed)
        for (const s of statuses) {
          const nextStatus: "failed" | "read" | "delivered" =
            s.status === "failed" ? "failed" : s.status === "read" ? "read" : "delivered";
          const patch = { status: nextStatus };
          await supabaseAdmin
            .from("messages")
            .update(patch)
            .eq("provider_message_id", s.provider_message_id);

          if (s.status === "failed" && s.error) {
            await supabaseAdmin.from("channel_events").insert({
              company_id: channel.company_id,
              channel_id: channel.id,
              event_type: "send_failed",
              payload: { provider_message_id: s.provider_message_id, error: s.error },
            });
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
