import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGuardianModel } from "@/lib/ai-provider.server";

// ---- List conversations ----
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      input:
        | {
            status?: string;
            search?: string;
            scope?: "all" | "mine" | "unassigned";
            chatType?: "all" | "direct" | "group";
          }
        | undefined,
    ) =>
      z
        .object({
          status: z.enum(["open", "pending", "resolved", "all"]).optional(),
          search: z.string().optional(),
          scope: z.enum(["all", "mine", "unassigned"]).optional(),
          chatType: z.enum(["all", "direct", "group"]).optional(),
        })
        .optional()
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("conversations")
      .select(
        "id, status, unread_count, last_message_at, last_message_preview, pinned, pinned_at, channel_id, assigned_type, assigned_user_id, assigned_agent_id, contact:contacts(id, name, phone, avatar_url), channel:channels!channel_id(id, name, phone_number), assigned_agent:ai_agents!assigned_agent_id(id, name, avatar_url)",
      )
      .order("pinned", { ascending: false })
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .is("deleted_at", null)
      .limit(100);




    if (data?.status && data.status !== "all") {
      query = query.eq("status", data.status as "open" | "pending" | "resolved");
    }
    if (data?.scope === "mine") {
      query = query.eq("assigned_user_id", context.userId);
    } else if (data?.scope === "unassigned") {
      query = query.eq("assigned_type", "unassigned");
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    // Attach assigned_user profile lookup (assigned_user_id -> auth.users, so no PostgREST FK to profiles)
    const userIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => (r as { assigned_user_id: string | null }).assigned_user_id)
          .filter((v): v is string => !!v),
      ),
    );
    const profilesById = new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>) {
        profilesById.set(p.id, p);
      }
    }
    const withProfiles = (rows ?? []).map((r) => ({
      ...r,
      assigned_user:
        (r as { assigned_user_id: string | null }).assigned_user_id
          ? profilesById.get((r as { assigned_user_id: string }).assigned_user_id) ?? null
          : null,
    }));

    let filtered =
      data?.search && data.search.trim().length > 0
        ? withProfiles.filter((r) => {
            const s = data.search!.toLowerCase();
            const c = r.contact as { name?: string; phone?: string } | null;
            return (
              c?.name?.toLowerCase().includes(s) ||
              c?.phone?.toLowerCase().includes(s) ||
              r.last_message_preview?.toLowerCase().includes(s)
            );
          })
        : withProfiles;

    if (data?.chatType === "group") {
      filtered = filtered.filter((r) => {
        const c = r.contact as { name?: string; phone?: string } | null;
        return c?.phone?.includes("g.us") || c?.name?.toLowerCase().includes("grupo");
      });
    } else if (data?.chatType === "direct") {
      filtered = filtered.filter((r) => {
        const c = r.contact as { name?: string; phone?: string } | null;
        return !c?.phone?.includes("g.us") && !c?.name?.toLowerCase().includes("grupo");
      });
    }

    return filtered ?? [];
  });



// ---- Get single conversation with contact + tags + custom fields ----
export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: conv, error } = await context.supabase
      .from("conversations")
      .select(
        "id, status, unread_count, last_message_at, channel_id, transferred_from_channel_id, transferred_at, assigned_type, assigned_user_id, assigned_agent_id, deleted_at, contact:contacts(id, name, phone, email, notes, avatar_url), channel:channels!channel_id(id, name, phone_number), transferred_from:channels!transferred_from_channel_id(id, name), assigned_agent:ai_agents!assigned_agent_id(id, name, avatar_url)",
      )
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Conversa não encontrada");

    let assignedUser: { id: string; full_name: string | null; avatar_url: string | null } | null = null;
    if (conv.assigned_user_id) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", conv.assigned_user_id)
        .maybeSingle();
      assignedUser = prof ?? null;
    }

    const contactId = (conv.contact as { id: string } | null)?.id;
    let tags: Array<{ id: string; name: string; color: string }> = [];
    let customValues: Array<{ field_id: string; value: string | null }> = [];
    if (contactId) {
      const [{ data: ct }, { data: cfv }] = await Promise.all([
        context.supabase
          .from("contact_tags")
          .select("tag:tags(id, name, color)")
          .eq("contact_id", contactId),
        context.supabase
          .from("contact_field_values")
          .select("field_id, value")
          .eq("contact_id", contactId),
      ]);
      tags = (ct ?? []).map((r) => r.tag as { id: string; name: string; color: string }).filter(Boolean);
      customValues = cfv ?? [];
    }
    return { conversation: { ...conv, assigned_user: assignedUser }, tags, customValues };
  });


// ---- Messages ----
export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select(
        "id, direction, type, body, media_url, media_metadata, status, provider_message_id, created_at, reply_to_id, deleted_at, deleted_scope, deleted_by, deleted_reason, channel_id, channel:channels!channel_id(id, name, phone_number)",
      )
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---- Reply channel context (default + available) ----
// INBOX FINALIZATION 01 — powers the composer channel picker.
export const getReplyChannelContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error: convErr } = await context.supabase
      .from("conversations")
      .select("company_id, channel_id, contact:contacts(last_inbound_channel_id)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversa não encontrada");
    const contact = conv.contact as { last_inbound_channel_id?: string | null } | null;
    const defaultChannelId =
      contact?.last_inbound_channel_id ?? conv.channel_id ?? null;
    const { data: chs, error: chErr } = await context.supabase
      .from("channels")
      .select("id, name, phone_number, provider_type, status")
      .eq("company_id", conv.company_id)
      .in("provider_type", ["whatsapp_cloud", "evolution", "baileys"])
      .order("name");
    if (chErr) throw new Error(chErr.message);
    return {
      defaultChannelId,
      channels: (chs ?? []) as Array<{
        id: string;
        name: string;
        phone_number: string | null;
        provider_type: string | null;
        status: string | null;
      }>,
    };
  });

// ---- Send message ----
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      type: "text" | "image" | "audio" | "file" | "video";
      body?: string;
      mediaUrl?: string;
      mediaMetadata?: Record<string, unknown>;
      replyToId?: string;
      channelId?: string;
    }) =>
      z
        .object({
          conversationId: z.string().uuid(),
          type: z.enum(["text", "image", "audio", "file", "video"]),
          body: z.string().optional(),
          mediaUrl: z.string().optional(),
          mediaMetadata: z.record(z.string(), z.unknown()).optional(),
          replyToId: z.string().uuid().optional(),
          channelId: z.string().uuid().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    // ZENDA CORE ALIGNMENT 01 — Onda 4 (Reply Channel Continuity):
    // O canal de resposta padrão é SEMPRE o último canal por onde o contato falou
    // (contacts.last_inbound_channel_id). Cai de volta para conversations.channel_id
    // e por último para qualquer canal WA da empresa.
    // INBOX FINALIZATION 01: o usuário pode sobrescrever manualmente via data.channelId
    // (validando que pertence à mesma company via RLS).
    const { data: conv, error: convErr } = await context.supabase
      .from("conversations")
      .select(
        "company_id, channel_id, contact_id, contact:contacts(phone, phone_canonical, last_inbound_channel_id)",
      )
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversa não encontrada");

    const contactRow = conv.contact as {
      phone?: string;
      phone_canonical?: string;
      last_inbound_channel_id?: string | null;
    } | null;
    const toPhoneRaw = contactRow?.phone_canonical ?? contactRow?.phone ?? "";
    const toPhone = toPhoneRaw.replace(/^\+/, "").replace(/\D/g, "");

    const preferredChannelId =
      data.channelId ?? contactRow?.last_inbound_channel_id ?? conv.channel_id ?? null;
    type ChannelRow = {
      id: string;
      provider_type: string | null;
      credentials: unknown;
      phone_number: string | null;
      company_id: string;
    };
    let channel: ChannelRow | null = null;
    if (preferredChannelId) {
      const { data: chRow } = await context.supabase
        .from("channels")
        .select("id, provider_type, credentials, phone_number, company_id")
        .eq("id", preferredChannelId)
        .maybeSingle();
      if (chRow && (chRow as ChannelRow).company_id === conv.company_id) {
        channel = chRow as ChannelRow;
      } else if (data.channelId) {
        throw new Error("Canal selecionado não pertence à empresa");
      }
    }



    // Reply / quote: resolve the referenced message's provider id so we can
    // include it in the outbound WhatsApp payload (`context.message_id`).
    // Missing provider id → we still persist reply_to_id locally so the
    // Inbox renders the quoted preview, but WhatsApp won't render the
    // native quote (provider hasn't seen that message).
    let replyToProviderId: string | undefined;
    if (data.replyToId) {
      const { data: orig } = await context.supabase
        .from("messages")
        .select("id, provider_message_id, conversation_id")
        .eq("id", data.replyToId)
        .maybeSingle();
      if (orig && orig.conversation_id === data.conversationId) {
        replyToProviderId = orig.provider_message_id ?? undefined;
      }
    }

    // 1. Inserção prévia no banco com status 'sending' para garantir que o registro exista localmente
    const { data: initialMsg, error: insertError } = await context.supabase
      .from("messages")
      .insert({
        company_id: conv.company_id,
        conversation_id: data.conversationId,
        channel_id: channel?.id ?? null,
        direction: "outbound",
        type: data.type,
        body: data.body ?? null,
        media_url: data.mediaUrl ?? null,
        media_metadata: Object.keys(data.mediaMetadata ?? {}).length ? (data.mediaMetadata as never) : null,
        reply_to_id: data.replyToId ?? null,
        sender_user_id: context.userId,
        status: "sending",
      })
      .select("*")
      .single();

    if (insertError || !initialMsg) {
      throw new Error(insertError?.message ?? "Falha ao gravar mensagem inicial no banco de dados");
    }

    // 2. Dispatch to provider (best-effort)
    let providerMessageId: string | null = null;
    let sendError: string | null = null;
    if (channel && toPhone) {
      const { dispatchSend } = await import("@/lib/wa-providers/index.server");
      const payload =
        data.type === "text"
          ? { type: "text" as const, to: toPhone, body: data.body ?? "", replyToProviderId }
          : data.type === "image"
            ? { type: "image" as const, to: toPhone, mediaUrl: data.mediaUrl ?? "", caption: data.body, replyToProviderId }
            : data.type === "audio"
              ? { type: "audio" as const, to: toPhone, mediaUrl: data.mediaUrl ?? "", replyToProviderId }
              : data.type === "video"
                ? { type: "video" as const, to: toPhone, mediaUrl: data.mediaUrl ?? "", caption: data.body, replyToProviderId }
                : {
                    type: "file" as const,
                    to: toPhone,
                    mediaUrl: data.mediaUrl ?? "",
                    filename: (data.mediaMetadata?.name as string | undefined) ?? "arquivo",
                    replyToProviderId,
                  };
      const res = await dispatchSend(
        {
          id: channel.id,
          provider_type: channel.provider_type,
          credentials: (channel.credentials ?? {}) as Record<string, unknown>,
          phone_number: channel.phone_number,
        },
        payload,
      );
      if (res.ok) providerMessageId = res.provider_message_id;
      else sendError = res.error;
    }

    const mergedMeta = {
      ...(data.mediaMetadata ?? {}),
      ...(sendError ? { send_error: sendError } : {}),
    };

    // 3. Atualiza o registro prévio com o provider_message_id e status final usando supabaseAdmin para evitar restrições de RLS
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const finalStatus = sendError ? "failed" : "sent";
    let updatedMsg: typeof initialMsg | null = null;

    const { data: uMsg, error: uErr } = await supabaseAdmin
      .from("messages")
      .update({
        provider_message_id: providerMessageId ?? null,
        status: finalStatus,
        media_metadata: Object.keys(mergedMeta).length ? (mergedMeta as never) : null,
      })
      .eq("id", initialMsg.id)
      .select("*")
      .single();

    updatedMsg = uMsg;

    // Trata colisão se o webhook registrou o provider_message_id primeiro em outra linha
    if (uErr && providerMessageId) {
      const { data: existing } = await supabaseAdmin
        .from("messages")
        .select("*")
        .eq("conversation_id", data.conversationId)
        .eq("provider_message_id", providerMessageId)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin.from("messages").delete().eq("id", initialMsg.id);
        await supabaseAdmin.from("messages").update({ status: finalStatus }).eq("id", existing.id);
        updatedMsg = { ...existing, status: finalStatus };
      }
    }

    if (!updatedMsg) {
      await supabaseAdmin
        .from("messages")
        .update({ status: finalStatus, provider_message_id: providerMessageId ?? null })
        .eq("id", initialMsg.id);
      updatedMsg = {
        ...initialMsg,
        status: finalStatus,
        provider_message_id: providerMessageId ?? null,
      };
    }

    const msg = updatedMsg;

    if (sendError && channel?.id) {
      await context.supabase.from("channel_events").insert({
        company_id: conv.company_id,
        channel_id: channel.id,
        conversation_id: data.conversationId,
        event_type: "send_failed",
        payload: { error: sendError, message_id: msg.id },
      });
    }

    // Update conversation last message
    const preview =
      data.type === "text"
        ? (data.body ?? "").slice(0, 120)
        : data.type === "image"
          ? "📷 Imagem"
          : data.type === "audio"
            ? "🎤 Áudio"
            : data.type === "video"
              ? "🎬 Vídeo"
              : "📎 Arquivo";
    await context.supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_preview: preview })
      .eq("id", data.conversationId);

    return msg;
  });

// ---- Mark as read ----
export const markAsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markConversationAsUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ unread_count: 1 })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Update conversation (status/assignee) ----
export const updateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id: string; status?: "open" | "pending" | "resolved"; pinned?: boolean }) =>
      z
        .object({
          id: z.string().uuid(),
          status: z.enum(["open", "pending", "resolved"]).optional(),
          pinned: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      status?: "open" | "pending" | "resolved";
      pinned?: boolean;
      pinned_at?: string | null;
    } = {};
    if (data.status) patch.status = data.status;
    if (typeof data.pinned === "boolean") {
      if (data.pinned) {
        // Enforce max pinned conversations per company (WhatsApp Web uses 3).
        const { count, error: countErr } = await context.supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("pinned", true)
          .neq("id", data.id);
        if (countErr) throw new Error(countErr.message);
        if ((count ?? 0) >= MAX_PINNED_CONVERSATIONS) {
          throw new Error(
            `Limite de ${MAX_PINNED_CONVERSATIONS} conversas fixadas atingido. Desafixe uma antes de fixar outra.`,
          );
        }
        patch.pinned = true;
        patch.pinned_at = new Date().toISOString();
      } else {
        patch.pinned = false;
        patch.pinned_at = null;
      }
    }
    const { error } = await context.supabase.from("conversations").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Maximum pinned conversations per company (mirrors WhatsApp Web). */
export const MAX_PINNED_CONVERSATIONS = 3;



// ---- Update contact ----
export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id: string; name?: string; email?: string | null; notes?: string | null }) =>
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(1).optional(),
          email: z.string().email().nullable().optional(),
          notes: z.string().nullable().optional(),
        })
        .parse(input),
  )

  .handler(async ({ data, context }) => {
    const patch: { name?: string; email?: string | null; notes?: string | null } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.email !== undefined) patch.email = data.email;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await context.supabase.from("contacts").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---- Toggle tag on contact ----
export const toggleContactTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contactId: string; tagId: string; add: boolean }) =>
    z.object({ contactId: z.string().uuid(), tagId: z.string().uuid(), add: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: contact } = await context.supabase
      .from("contacts")
      .select("company_id")
      .eq("id", data.contactId)
      .maybeSingle();
    if (!contact) throw new Error("Contato não encontrado");

    if (data.add) {
      const { error } = await context.supabase
        .from("contact_tags")
        .upsert({ contact_id: data.contactId, tag_id: data.tagId, company_id: contact.company_id });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("contact_tags")
        .delete()
        .eq("contact_id", data.contactId)
        .eq("tag_id", data.tagId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---- List company tags ----
export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tags")
      .select("id, name, color")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- List quick replies ----
export const listQuickReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quick_replies")
      .select("id, shortcut, title, body")
      .order("shortcut");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Get media signed URL ----
export const getMediaUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string; messageId?: string }) =>
    z.object({ path: z.string(), messageId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let path = data.path;

    // Mídia legada recebida do WhatsApp fica criptografada (`.enc`) e não abre
    // no browser. Nesse caso baixamos, descriptografamos e migramos para o
    // bucket na primeira visualização.
    const { isEncryptedWhatsAppUrl, persistInboundWhatsAppMedia } = await import(
      "@/lib/wa-providers/whatsapp-media.server"
    );
    if (isEncryptedWhatsAppUrl(path) && data.messageId) {
      const { data: message } = await context.supabase
        .from("messages")
        .select("id, company_id, type, media_url, media_metadata")
        .eq("id", data.messageId)
        .maybeSingle();
      if (message?.company_id && message.media_url) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const kind = (["image", "audio", "video", "file"] as const).includes(message.type as never)
          ? (message.type as "image" | "audio" | "video" | "file")
          : "file";
        const stored = await persistInboundWhatsAppMedia(supabaseAdmin as never, {
          companyId: message.company_id,
          kind,
          mediaUrl: message.media_url,
          metadata: (message.media_metadata as Record<string, unknown> | null) ?? null,
        });
        if (stored) {
          await supabaseAdmin.from("messages").update({ media_url: stored }).eq("id", message.id);
          path = stored;
        }
      }
    }

    // If caller already passed a full URL (signed or public), return it as-is.
    if (/^https?:\/\//i.test(path)) {
      return { url: path };
    }
    // Normalize: strip any leading bucket prefix if present.
    const objectPath = path.replace(/^\/?message-media\//, "");
    const { data: signed, error } = await context.supabase.storage
      .from("message-media")
      .createSignedUrl(objectPath, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });



// ---- Simulate inbound (dev helper) ----
export const simulateInbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; body: string }) =>
    z.object({ conversationId: z.string().uuid(), body: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("company_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");

    const { error } = await context.supabase.from("messages").insert({
      company_id: conv.company_id,
      conversation_id: data.conversationId,
      direction: "inbound",
      type: "text",
      body: data.body,
      status: "delivered",
    });
    if (error) throw new Error(error.message);

    await context.supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: data.body.slice(0, 120),
        unread_count: 1,
      })
      .eq("id", data.conversationId);

    return { ok: true };
  });

// ---- List active flows for current company ----
export const listActiveFlowsForCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("flows")
      .select("id, name, status")
      .eq("status", "active")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const flows = data ?? [];
    if (flows.length === 0) return [];

    const sql = [
      "SELECT flow_id, id, version_number, status, published_at",
      "FROM public.flow_versions",
      "WHERE flow_id = ANY($1) AND status = 'published'",
    ].join(" ");
    const { data: published, error: pubErr } = await context.supabase
      .from("flow_versions")
      .select("flow_id, id, version_number, status, published_at")
      .in("flow_id", flows.map((f) => f.id))
      .eq("status", "published");
    if (pubErr) throw new Error(pubErr.message);

    const publishedFlowIds = new Set((published ?? []).map((v) => v.flow_id));
    console.info("[FLOW_RUNTIME_AUDIT] InboxListActiveFlowsResolved", {
      function: "listActiveFlowsForCompany",
      user_id: context.userId,
      sql,
      active_flow_count: flows.length,
      published_rows_returned: published?.length ?? 0,
      returned_flow_ids: flows.filter((flow) => publishedFlowIds.has(flow.id)).map((flow) => flow.id),
      hidden_active_without_published: flows.filter((flow) => !publishedFlowIds.has(flow.id)).map((flow) => flow.id),
    });
    return flows.filter((flow) => publishedFlowIds.has(flow.id));
  });

// ---- List active AI agents ----
export const listActiveAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_agents")
      .select("id, name, model, avatar_url, personality")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Run flow on conversation (delegates to Flow Executor engine) ----
export const runFlowOnConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; flowId: string; idempotencyKey?: string }) =>
    z
      .object({
        conversationId: z.string().uuid(),
        flowId: z.string().uuid(),
        idempotencyKey: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    console.info("[FLOW_RUNTIME_AUDIT] BackendFunctionCalled", {
      function: "runFlowOnConversation",
      params: {
        conversation_id: data.conversationId,
        flow_id: data.flowId,
        flow_version_id: null,
        trigger_id: data.idempotencyKey ?? null,
      },
      user_id: context.userId,
    });

    const { data: conv } = await context.supabase
      .from("conversations")
      .select("id, company_id, channel_id, contact_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");

    console.info("[FLOW_RUNTIME_AUDIT] InboxRunFlowRequested", {
      workspace_id: conv.company_id,
      organization_id: conv.company_id,
      conversation_id: data.conversationId,
      flow_id: data.flowId,
      flow_version_id: null,
      trigger_id: data.idempotencyKey ?? null,
      user_id: context.userId,
      channel_id: conv.channel_id,
      contact_id: conv.contact_id,
      trigger: "inbox",
    });

    const { data: flow } = await context.supabase
      .from("flows")
      .select("id, company_id, status, trigger_type, runs_count")
      .eq("id", data.flowId)
      .maybeSingle();
    if (!flow) throw new Error("Fluxo não encontrado");
    if (flow.company_id !== conv.company_id) throw new Error("Fluxo não pertence à empresa");

    const sql = [
      "SELECT id, version_number, status, published_at",
      "FROM public.flow_versions",
      "WHERE flow_id = $1 AND status = 'published'",
      "ORDER BY published_at DESC NULLS LAST, version_number DESC",
      "LIMIT 3",
    ].join(" ");
    const { data: publishedVersions, error: pubErr } = await context.supabase
      .from("flow_versions")
      .select("id, version_number, status, published_at")
      .eq("flow_id", data.flowId)
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("version_number", { ascending: false })
      .limit(3);
    if (pubErr) throw new Error(pubErr.message);

    console.info("[FLOW_RUNTIME_AUDIT] InboxRunFlowResolved", {
      function: "runFlowOnConversation",
      flow_id: data.flowId,
      flow_status: flow.status,
      flow_trigger_type: flow.trigger_type,
      conversation_id: data.conversationId,
      company_id: conv.company_id,
      sql,
      rows_returned: publishedVersions?.length ?? 0,
      version_found: publishedVersions?.[0]?.id ?? null,
      version_status: publishedVersions?.[0]?.status ?? null,
      published_versions: (publishedVersions ?? []).map((v) => ({
        id: v.id,
        version_number: v.version_number,
        status: v.status,
        published_at: v.published_at,
      })),
      not_published_reason: (publishedVersions?.length ?? 0) === 0 ? "no_rows_for_flow_id_and_status_published" : null,
    });

    const { createAndExecuteRun } = await import("@/lib/flow-executor.server");
    const result = await createAndExecuteRun({
      supabase: context.supabase as never,
      companyId: conv.company_id,
      flowId: data.flowId,
      conversationId: data.conversationId,
      channelId: conv.channel_id,
      triggerType: "inbox",
      idempotencyKey: data.idempotencyKey,
    });

    await context.supabase
      .from("flows")
      .update({ runs_count: (flow.runs_count ?? 0) + 1 })
      .eq("id", data.flowId);

    if (result.state === "FAILED") throw new Error(result.error ?? "Execução falhou");
    return { ok: true, flowRunId: result.runId, messagesSent: result.messagesSent, state: result.state };
  });


// ---- Run AI agent on conversation ----
export const runAgentOnConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; agentId: string }) =>
    z.object({ conversationId: z.string().uuid(), agentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("id, company_id, contact:contacts(name)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");

    const { data: agent } = await context.supabase
      .from("ai_agents")
      .select("id, name, model, prompt, personality, company_id")
      .eq("id", data.agentId)
      .maybeSingle();
    if (!agent) throw new Error("Agente não encontrado");
    if (agent.company_id !== conv.company_id) throw new Error("Agente não pertence à empresa");

    const { data: history } = await context.supabase
      .from("messages")
      .select("direction, type, body")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(30);

    const contactName = (conv.contact as { name?: string } | null)?.name ?? "cliente";
    const systemPrompt = [
      agent.prompt || "Você é um atendente prestativo.",
      agent.personality ? `Personalidade: ${agent.personality}` : "",
      `Você está conversando com ${contactName}. Responda em português, de forma clara e objetiva.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { model, modelId } = await buildGuardianModel(context.supabase, conv.company_id, agent.model);
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: (history ?? [])
        .filter((m) => m.type === "text" && m.body)
        .map((m) => ({
          role: m.direction === "outbound" ? ("assistant" as const) : ("user" as const),
          content: m.body ?? "",
        })),
    });
    const reply = result.text.trim();
    if (!reply) throw new Error("Agente não retornou resposta");

    const { error: mErr } = await context.supabase.from("messages").insert({
      company_id: conv.company_id,
      conversation_id: data.conversationId,
      direction: "outbound",
      type: "text",
      body: reply,
      status: "sent",
      sender_user_id: null,
      media_metadata: {
        automated: true,
        agent_id: data.agentId,
        agent_name: agent.name,
        model: modelId,
      },
    });
    if (mErr) throw new Error(mErr.message);

    await context.supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: reply.slice(0, 120),
      })
      .eq("id", data.conversationId);

    return { ok: true, reply };
  });

// ---- helpers ----
type NodeRow = { id: string; node_type: string; data: unknown; created_at: string };
type EdgeRow = { source_node_id: string; target_node_id: string };
function orderNodes(nodes: NodeRow[], edges: EdgeRow[]): NodeRow[] {
  if (nodes.length === 0) return [];
  if (edges.length === 0) return nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const targets = new Set(edges.map((e) => e.target_node_id));
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source_node_id)) outgoing.set(e.source_node_id, []);
    outgoing.get(e.source_node_id)!.push(e.target_node_id);
  }
  const roots = nodes.filter((n) => !targets.has(n.id));
  const start = roots[0] ?? nodes[0];
  const visited = new Set<string>();
  const out: NodeRow[] = [];
  const queue: string[] = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node) out.push(node);
    for (const next of outgoing.get(id) ?? []) queue.push(next);
  }
  for (const n of nodes) if (!visited.has(n.id)) out.push(n);
  return out;
}

// ---- List members of current company (for assignment) ----
export const listCompanyMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.company_id) return [];
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .eq("company_id", me.company_id)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
    }>;
  });

// ---- Assign conversation to user / agent / nobody ----
export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      mode: "unassigned" | "user" | "agent";
      userId?: string | null;
      agentId?: string | null;
    }) =>
      z
        .object({
          conversationId: z.string().uuid(),
          mode: z.enum(["unassigned", "user", "agent"]),
          userId: z.string().uuid().nullable().optional(),
          agentId: z.string().uuid().nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("id, company_id, channel_id, contact_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");

    let patch: {
      assigned_type: "unassigned" | "agent_user" | "ai_agent";
      assigned_user_id: string | null;
      assigned_agent_id: string | null;
    };
    let label = "Ninguém";

    if (data.mode === "user") {
      if (!data.userId) throw new Error("Usuário não informado");
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("id, full_name, email, company_id")
        .eq("id", data.userId)
        .maybeSingle();
      if (!prof || prof.company_id !== conv.company_id)
        throw new Error("Usuário não pertence à empresa");
      patch = {
        assigned_type: "agent_user",
        assigned_user_id: data.userId,
        assigned_agent_id: null,
      };
      label = prof.full_name || prof.email || "Usuário";
    } else if (data.mode === "agent") {
      if (!data.agentId) throw new Error("Agente não informado");
      const { data: agent } = await context.supabase
        .from("ai_agents")
        .select("id, name, company_id")
        .eq("id", data.agentId)
        .maybeSingle();
      if (!agent || agent.company_id !== conv.company_id)
        throw new Error("Agente não pertence à empresa");
      patch = {
        assigned_type: "ai_agent",
        assigned_user_id: null,
        assigned_agent_id: data.agentId,
      };
      label = agent.name || "Agente IA";
    } else {
      patch = {
        assigned_type: "unassigned",
        assigned_user_id: null,
        assigned_agent_id: null,
      };
    }

    const { error } = await context.supabase
      .from("conversations")
      .update(patch)
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("channel_events").insert({
      company_id: conv.company_id,
      channel_id: conv.channel_id ?? null,
      contact_id: conv.contact_id,
      conversation_id: data.conversationId,
      event_type: "conversation_assigned",
      payload: {
        mode: data.mode,
        user_id: patch.assigned_user_id,
        agent_id: patch.assigned_agent_id,
        label,
        by: context.userId,
      },
    });

    return { ok: true, mode: data.mode, label };
  });

// ---- Auto-respond with assigned AI agent, if any ----
export const maybeAutoRespondWithAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations")
      .select(
        "id, company_id, status, assigned_type, assigned_agent_id, bot_paused_until, contact:contacts(name)",
      )
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) return { ok: false, skipped: "no_conv" as const };
    if (conv.status === "resolved") return { ok: false, skipped: "resolved" as const };
    if (conv.assigned_type !== "ai_agent" || !conv.assigned_agent_id) {
      return { ok: false, skipped: "not_ai_assigned" as const };
    }
    if (conv.bot_paused_until && new Date(conv.bot_paused_until).getTime() > Date.now()) {
      return { ok: false, skipped: "bot_paused" as const };
    }

    // Skip if last message is already outbound (agent already answered)
    const { data: last } = await context.supabase
      .from("messages")
      .select("direction, media_metadata")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && last.direction === "outbound") {
      return { ok: false, skipped: "already_answered" as const };
    }

    const { data: agent } = await context.supabase
      .from("ai_agents")
      .select("id, name, model, prompt, personality, company_id, is_active")
      .eq("id", conv.assigned_agent_id)
      .maybeSingle();
    if (!agent || agent.company_id !== conv.company_id) {
      return { ok: false, skipped: "no_agent" as const };
    }
    if (!agent.is_active) {
      return { ok: false, skipped: "agent_inactive" as const };
    }

    const { data: history } = await context.supabase
      .from("messages")
      .select("direction, type, body")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(30);

    const contactName = (conv.contact as { name?: string } | null)?.name ?? "cliente";
    const systemPrompt = [
      agent.prompt || "Você é um atendente prestativo.",
      agent.personality ? `Personalidade: ${agent.personality}` : "",
      `Você está conversando com ${contactName}. Responda em português, de forma clara, curta e objetiva.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { model, modelId } = await buildGuardianModel(context.supabase, conv.company_id, agent.model);
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: (history ?? [])
        .filter((m) => m.type === "text" && m.body)
        .map((m) => ({
          role: m.direction === "outbound" ? ("assistant" as const) : ("user" as const),
          content: m.body ?? "",
        })),
    });
    const reply = result.text.trim();
    if (!reply) return { ok: false, skipped: "no_reply" as const };

    await context.supabase.from("messages").insert({
      company_id: conv.company_id,
      conversation_id: data.conversationId,
      direction: "outbound",
      type: "text",
      body: reply,
      status: "sent",
      sender_user_id: null,
      media_metadata: {
        automated: true,
        auto: true,
        agent_id: agent.id,
        agent_name: agent.name,
        model: modelId,
      },
    });

    await context.supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: reply.slice(0, 120),
      })
      .eq("id", data.conversationId);

    return { ok: true, reply };
  });

// ---- Forward messages to one or more target conversations ----
// Reuses the provider dispatch used by `sendMessage`. For each
// (source × target) pair we dispatch through the target channel and
// persist an outbound row. Provider failures are recorded per row
// (status='failed' + media_metadata.send_error) — no throw — so the
// caller gets a per-target report and can show a warning instead of
// aborting the whole operation.
export const forwardMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { sourceMessageIds: string[]; targetConversationIds: string[] }) =>
      z
        .object({
          sourceMessageIds: z.array(z.string().uuid()).min(1).max(20),
          targetConversationIds: z.array(z.string().uuid()).min(1).max(20),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: sources, error: sErr } = await context.supabase
      .from("messages")
      .select("id, type, body, media_url, media_metadata, deleted_at, created_at")
      .in("id", data.sourceMessageIds)
      .order("created_at", { ascending: true });
    if (sErr) throw new Error(sErr.message);

    const valid = (sources ?? []).filter(
      (m) => !(m as { deleted_at: string | null }).deleted_at,
    ) as Array<{
      id: string;
      type: "text" | "image" | "audio" | "video" | "file";
      body: string | null;
      media_url: string | null;
      media_metadata: Record<string, unknown> | null;
    }>;
    if (valid.length === 0) {
      throw new Error("Nenhuma mensagem válida para encaminhar");
    }

    const { dispatchSend } = await import("@/lib/wa-providers/index.server");

    const results: Array<{
      targetId: string;
      forwarded: number;
      failed: number;
      errors: string[];
    }> = [];

    for (const targetId of data.targetConversationIds) {
      const { data: conv } = await context.supabase
        .from("conversations")
        .select(
          "company_id, channel_id, contact:contacts(phone), channel:channels!channel_id(id, provider_type, credentials, phone_number)",
        )
        .eq("id", targetId)
        .maybeSingle();

      if (!conv) {
        results.push({
          targetId,
          forwarded: 0,
          failed: valid.length,
          errors: ["Conversa não encontrada"],
        });
        continue;
      }

      const toPhoneRaw = (conv.contact as { phone?: string } | null)?.phone ?? "";
      const toPhone = toPhoneRaw.replace(/^\+/, "").replace(/\D/g, "");
      const channel = conv.channel as {
        id: string;
        provider_type: string | null;
        credentials: unknown;
        phone_number: string | null;
      } | null;

      let forwarded = 0;
      let failed = 0;
      const errors: string[] = [];
      let lastPreview = "";

      for (const src of valid) {
        let providerMessageId: string | null = null;
        let sendError: string | null = null;

        if (channel && toPhone) {
          const meta = (src.media_metadata ?? {}) as { name?: string };
          const payload =
            src.type === "text"
              ? { type: "text" as const, to: toPhone, body: src.body ?? "" }
              : src.type === "image"
                ? {
                    type: "image" as const,
                    to: toPhone,
                    mediaUrl: src.media_url ?? "",
                    caption: src.body ?? undefined,
                  }
                : src.type === "audio"
                  ? { type: "audio" as const, to: toPhone, mediaUrl: src.media_url ?? "" }
                  : src.type === "video"
                    ? {
                        type: "video" as const,
                        to: toPhone,
                        mediaUrl: src.media_url ?? "",
                        caption: src.body ?? undefined,
                      }
                    : {
                        type: "file" as const,
                        to: toPhone,
                        mediaUrl: src.media_url ?? "",
                        filename: meta.name ?? "arquivo",
                      };

          const res = await dispatchSend(
            {
              id: channel.id,
              provider_type: channel.provider_type,
              credentials: (channel.credentials ?? {}) as Record<string, unknown>,
              phone_number: channel.phone_number,
            },
            payload,
          );
          if (res.ok) providerMessageId = res.provider_message_id;
          else sendError = res.error;
        }

        const mergedMeta = {
          ...(src.media_metadata ?? {}),
          forwarded: true,
          forwarded_from_id: src.id,
          ...(sendError ? { send_error: sendError } : {}),
        };

        const { error: insErr } = await context.supabase.from("messages").insert({
          company_id: conv.company_id,
          conversation_id: targetId,
          direction: "outbound",
          type: src.type,
          body: src.body,
          media_url: src.media_url,
          media_metadata: mergedMeta as never,
          provider_message_id: providerMessageId,
          sender_user_id: context.userId,
          status: sendError ? "failed" : "sent",
        });

        if (insErr) {
          failed++;
          errors.push(insErr.message);
          continue;
        }
        if (sendError) {
          failed++;
          errors.push(sendError);
        } else {
          forwarded++;
        }

        lastPreview =
          src.type === "text"
            ? (src.body ?? "").slice(0, 120)
            : src.type === "image"
              ? "📷 Imagem"
              : src.type === "audio"
                ? "🎤 Áudio"
                : src.type === "video"
                  ? "🎬 Vídeo"
                  : "📎 Arquivo";
      }

      if (lastPreview) {
        await context.supabase
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: lastPreview,
          })
          .eq("id", targetId);
      }

      results.push({ targetId, forwarded, failed, errors });
    }

    const totalForwarded = results.reduce((a, r) => a + r.forwarded, 0);
    const totalFailed = results.reduce((a, r) => a + r.failed, 0);
    return {
      results,
      totalForwarded,
      totalFailed,
      sourceCount: valid.length,
      targetCount: data.targetConversationIds.length,
    };
  });

// ---- Get message info (Item 4 · Grupo A · INBOX-UX-01) ----
// Read-only aggregation of persisted data for the "Informações da mensagem"
// panel. Returns only fields that exist in the database — the UI is
// responsible for rendering "Não disponível" for null values.
export const getMessageInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) =>
    z.object({ messageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: msg, error } = await context.supabase
      .from("messages")
      .select("*")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!msg) throw new Error("Mensagem não encontrada");

    let channel: { id: string; name: string | null; provider_type: string | null; phone_number: string | null } | null = null;
    let conversation: { id: string; status: string | null } | null = null;
    if (msg.conversation_id) {
      const { data: conv } = await context.supabase
        .from("conversations")
        .select(
          "id, status, channel:channels!channel_id(id, name, provider_type, phone_number)",
        )
        .eq("id", msg.conversation_id)
        .maybeSingle();
      if (conv) {
        conversation = { id: conv.id, status: conv.status };
        const ch = conv.channel as { id: string; name: string | null; provider_type: string | null; phone_number: string | null } | null;
        channel = ch ?? null;
      }
    }

    let senderUser: { id: string; full_name: string | null; avatar_url: string | null } | null = null;
    if (msg.sender_user_id) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", msg.sender_user_id)
        .maybeSingle();
      senderUser = prof ?? null;
    }
    let senderAgent: { id: string; name: string | null; model: string | null; avatar_url: string | null } | null = null;
    if (msg.sender_agent_id) {
      const { data: agent } = await context.supabase
        .from("ai_agents")
        .select("id, name, model, avatar_url")
        .eq("id", msg.sender_agent_id)
        .maybeSingle();
      senderAgent = agent ?? null;
    }

    let replyTo: { id: string; body: string | null; type: string; direction: string } | null = null;
    if (msg.reply_to_id) {
      const { data: rt } = await context.supabase
        .from("messages")
        .select("id, body, type, direction")
        .eq("id", msg.reply_to_id)
        .maybeSingle();
      replyTo = rt ?? null;
    }

    type EventRow = { id: string; event_type: string; created_at: string; payload: import("@/integrations/supabase/types").Json };
    let events: EventRow[] = [];
    if (msg.conversation_id) {
      const { data: evs } = await context.supabase
        .from("channel_events")
        .select("id, event_type, created_at, payload")
        .eq("conversation_id", msg.conversation_id)
        .order("created_at", { ascending: true })
        .limit(50);
      const isObj = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null;
      events = (evs ?? []).filter((e) => {
        const p = e.payload;
        if (!isObj(p)) return false;
        const mid = p.message_id;
        const pmid = p.provider_message_id;
        if (typeof mid === "string" && mid === msg.id) return true;
        if (
          typeof pmid === "string" &&
          msg.provider_message_id &&
          pmid === msg.provider_message_id
        )
          return true;
        return false;
      });
    }

    let flowRun: { id: string; flow_id: string; status: string; started_at: string | null; completed_at: string | null; flow_name: string | null } | null = null;
    if (msg.conversation_id && msg.direction === "outbound") {
      const { data: runs } = await context.supabase
        .from("flow_runs")
        .select("id, flow_id, status, started_at, completed_at, created_at, flow:flows!flow_id(name)")
        .eq("conversation_id", msg.conversation_id)
        .lte("created_at", msg.created_at)
        .order("created_at", { ascending: false })
        .limit(1);
      const r = runs?.[0];
      if (r) {
        const endedAt = r.completed_at ?? null;
        const startedAt = r.started_at ?? r.created_at;
        if (!endedAt || new Date(endedAt).getTime() >= new Date(msg.created_at).getTime() - 5_000) {
          const flow = r.flow as { name: string | null } | null;
          flowRun = {
            id: r.id,
            flow_id: r.flow_id,
            status: r.status,
            started_at: startedAt,
            completed_at: r.completed_at,
            flow_name: flow?.name ?? null,
          };
        }
      }
    }

    return {
      message: {
        id: msg.id,
        conversation_id: msg.conversation_id,
        direction: msg.direction,
        type: msg.type,
        body: msg.body,
        media_url: msg.media_url,
        media_metadata: msg.media_metadata,
        status: msg.status,
        created_at: msg.created_at,
        failed_at: msg.failed_at,
        error: msg.error,
        retry_count: msg.retry_count,
        provider_message_id: msg.provider_message_id,
        provider_delete_ack: msg.provider_delete_ack,
        provider_delete_error: msg.provider_delete_error,
        deleted_at: msg.deleted_at,
        deleted_scope: msg.deleted_scope,
        deleted_by: msg.deleted_by,
        deleted_reason: msg.deleted_reason,
        sender_user_id: msg.sender_user_id,
        sender_agent_id: msg.sender_agent_id,
        reply_to_id: msg.reply_to_id,
      },
      conversation,
      channel,
      senderUser,
      senderAgent,
      replyTo,
      events,
      flowRun,
    };
  });


// ============================================================
// INBOX FINALIZATION 01 — INTERNAL NOTES (notas internas por conversa)
// ============================================================
// Notas NUNCA são enviadas ao cliente. Persistidas em public.conversation_notes,
// isoladas por company via RLS + current_company_id().
export const listConversationNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("conversation_notes")
      .select("id, body, author_id, created_at, updated_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const authorIds = Array.from(new Set((rows ?? []).map((r) => r.author_id).filter(Boolean)));
    const profilesById = new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>();
    if (authorIds.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", authorIds);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>) {
        profilesById.set(p.id, p);
      }
    }
    return (rows ?? []).map((r) => ({ ...r, author: profilesById.get(r.author_id) ?? null }));
  });

export const createConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; body: string }) =>
    z
      .object({
        conversationId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Confirm conversation belongs to caller's company (RLS also enforces this,
    // but we short-circuit with a clear error before the insert).
    const { data: conv, error: convErr } = await context.supabase
      .from("conversations")
      .select("id, company_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada");

    const { data: inserted, error } = await context.supabase
      .from("conversation_notes")
      .insert({
        conversation_id: data.conversationId,
        company_id: (conv as { company_id: string }).company_id,
        author_id: context.userId,
        body: data.body,
      })
      .select("id, body, author_id, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS já restringe DELETE ao author. Falhas silenciosas (0 rows) sinalizam
    // tentativa cross-tenant/cross-author.
    const { error } = await context.supabase.from("conversation_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Pause / Resume automation (fluxo + agente IA) por conversa ----
// Modos: minutes=null => pausar indefinidamente; minutes=0 => retomar; number>0 => pausar por N minutos
const INDEFINITE_PAUSE_ISO = "3000-01-01T00:00:00.000Z";

export const setConversationBotPause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; minutes: number | null }) =>
    z
      .object({
        conversationId: z.string().uuid(),
        minutes: z.number().int().min(0).max(60 * 24 * 30).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let paused_until: string | null;
    if (data.minutes === null) {
      paused_until = INDEFINITE_PAUSE_ISO;
    } else if (data.minutes === 0) {
      paused_until = null;
    } else {
      paused_until = new Date(Date.now() + data.minutes * 60_000).toISOString();
    }
    const { error } = await context.supabase
      .from("conversations")
      .update({ bot_paused_until: paused_until })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true, bot_paused_until: paused_until };
  });

export const getConversationBotPause = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("conversations")
      .select("bot_paused_until")
      .eq("id", data.conversationId)
      .maybeSingle();
    return { bot_paused_until: (row?.bot_paused_until as string | null) ?? null };
  });






// ---- Excluir conversa (soft delete) ----
// Mantém mensagens e histórico no banco para auditoria; a conversa some das
// listas do Inbox. Registro em team_audit_log.
export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; reason?: string | null }) =>
    z
      .object({
        conversationId: z.string().uuid(),
        reason: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error: convErr } = await context.supabase
      .from("conversations")
      .select("id, company_id, contact_id, channel_id, deleted_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada");
    if ((conv as { deleted_at: string | null }).deleted_at) return { ok: true, alreadyDeleted: true };

    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("conversations")
      .update({
        deleted_at: now,
        deleted_by: context.userId,
        deleted_reason: data.reason ?? null,
      } as never)
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("team_audit_log").insert({
      company_id: conv.company_id,
      actor_id: context.userId,
      action: "conversation.deleted",
      entity: "conversation",
      entity_id: data.conversationId,
      diff: {
        contact_id: conv.contact_id,
        channel_id: conv.channel_id,
        reason: data.reason ?? null,
      } as never,
    } as never);

    return { ok: true, alreadyDeleted: false };
  });

// ---- Reação com Emoji em Mensagem ----
export const toggleMessageReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; emoji: string }) =>
    z
      .object({
        messageId: z.string().uuid(),
        emoji: z.string().min(1).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: msg, error: msgErr } = await context.supabase
      .from("messages")
      .select("id, conversation_id, provider_message_id, channel_id, media_metadata, conversation:conversations(company_id, channel_id, contact:contacts(phone, phone_canonical))")
      .eq("id", data.messageId)
      .maybeSingle();
    if (msgErr || !msg) throw new Error("Mensagem não encontrada");

    const meta = (msg.media_metadata as Record<string, unknown> | null) ?? {};
    const currentReaction = typeof meta.reaction === "string" ? meta.reaction : null;
    const newReaction = currentReaction === data.emoji ? null : data.emoji;

    const nextMeta: Record<string, unknown> = { ...meta, reaction: newReaction };
    if (newReaction === null) {
      delete nextMeta.reaction;
    }

    const { error: updErr } = await context.supabase
      .from("messages")
      .update({ media_metadata: nextMeta as never })
      .eq("id", data.messageId);

    if (updErr) throw new Error(updErr.message);

    // Opcionalmente despacha a reação para o WhatsApp do contato se houver provider_message_id
    if (msg.provider_message_id) {
      const conv = msg.conversation as { company_id?: string; channel_id?: string; contact?: { phone?: string; phone_canonical?: string } } | null;
      const chId = msg.channel_id ?? conv?.channel_id;
      const phoneRaw = conv?.contact?.phone_canonical ?? conv?.contact?.phone ?? "";
      const toPhone = phoneRaw.replace(/^\+/, "").replace(/\D/g, "");

      if (chId && toPhone) {
        const { data: channel } = await context.supabase
          .from("channels")
          .select("id, provider_type, credentials, company_id")
          .eq("id", chId)
          .maybeSingle();

        if (channel) {
          if (channel.provider_type === "whatsapp_cloud") {
            const { sendViaWhatsAppCloud } = await import("@/lib/wa-providers/whatsapp-cloud.server");
            await sendViaWhatsAppCloud((channel.credentials ?? {}) as any, {
              type: "reaction",
              to: toPhone,
              emoji: newReaction ?? "",
              targetProviderId: msg.provider_message_id,
            }).catch(() => null);
          } else if (channel.provider_type === "stevo" || channel.provider_type === "evolution" || channel.provider_type === "baileys") {
            const { sendViaStevo } = await import("@/lib/wa-providers/stevo.server");
            await sendViaStevo(
              { ...(channel.credentials as any), company_id: channel.company_id },
              {
                type: "reaction",
                to: toPhone,
                emoji: newReaction ?? "",
                targetProviderId: msg.provider_message_id,
              } as any,
            ).catch(() => null);
          }
        }
      }
    }

    return { ok: true, reaction: newReaction, conversationId: msg.conversation_id };
  });

// ---- Fixar / Arquivar / Silenciar Conversa ----
export const toggleConversationPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; pin?: boolean }) =>
    z.object({ conversationId: z.string().uuid(), pin: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("pinned")
      .eq("id", data.conversationId)
      .maybeSingle();
    const nextPin = data.pin ?? !(conv?.pinned ?? false);
    const { error } = await context.supabase
      .from("conversations")
      .update({
        pinned: nextPin,
        pinned_at: nextPin ? new Date().toISOString() : null,
      })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true, pinned: nextPin };
  });

export const toggleConversationArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; archive?: boolean }) =>
    z.object({ conversationId: z.string().uuid(), archive: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("archived_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    const isArchived = !!(conv as { archived_at?: string | null } | null)?.archived_at;
    const nextArchive = data.archive ?? !isArchived;
    const { error } = await context.supabase
      .from("conversations")
      .update({
        archived_at: nextArchive ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true, archived: nextArchive };
  });

export const toggleConversationMute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; minutes: number | null }) =>
    z.object({ conversationId: z.string().uuid(), minutes: z.number().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const mutedUntil = data.minutes ? new Date(Date.now() + data.minutes * 60_000).toISOString() : null;
    const { error } = await context.supabase
      .from("conversations")
      .update({
        muted_until: mutedUntil,
      } as never)
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true, muted_until: mutedUntil };
  });

export const startStevoCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId?: string; phone?: string }) =>
    z.object({ conversationId: z.string().uuid().optional(), phone: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let phone = data.phone;
    let companyId: string | null = null;
    let channelId: string | null = null;

    if (data.conversationId) {
      const { data: conv } = await context.supabase
        .from("conversations")
        .select("id, company_id, channel_id, contact:contacts(phone)")
        .eq("id", data.conversationId)
        .maybeSingle();
      if (conv) {
        companyId = conv.company_id;
        channelId = conv.channel_id;
        if (!phone) phone = (conv.contact as { phone?: string } | null)?.phone ?? undefined;
      }
    }

    if (!companyId) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("company_id")
        .eq("id", context.userId)
        .maybeSingle();
      companyId = profile?.company_id ?? null;
    }

    if (!companyId) throw new Error("Empresa não encontrada para o usuário");

    if (!phone) throw new Error("Telefone para chamada não informado");

    // Encontra canal Stevo ativo da empresa
    const query = context.supabase
      .from("channels")
      .select("id, provider_type, credentials, company_id")
      .eq("company_id", companyId)
      .eq("provider_type", "stevo")
      .eq("status", "connected");

    const { data: channels } = channelId ? await query.eq("id", channelId) : await query;
    const channel = (channels ?? [])[0];

    if (!channel) {
      throw new Error("Nenhum canal Stevo ativo encontrado para efetuar a ligação");
    }

    const { stevoMakeCall } = await import("@/lib/wa-providers/stevo.server");
    const res = await stevoMakeCall(
      {
        instance_id: (channel.credentials as any)?.instance_id,
        company_id: companyId,
      },
      phone,
    );

    // Registra o evento de disparo de chamada
    await context.supabase.from("channel_events").insert({
      company_id: companyId,
      channel_id: channel.id,
      conversation_id: data.conversationId ?? null,
      event_type: "message_sent" as never,
      payload: { action: "stevo_voice_call", phone, result: res },
    });

    if (!res.ok) {
      throw new Error(res.error || "Falha ao disparar chamada via Stevo Voice");
    }

    const creds = (channel.credentials ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      isWebCall: res.isWebCall ?? false,
      phone: phone.replace(/[^0-9]/g, ""),
      sipServer: (creds.sip_server as string) || "sm-grilo.stevo.chat:5060",
      sipUsername: (creds.sip_username as string) || "",
      sipPassword: (creds.sip_password as string) || "",
      message: res.message || "Chamada Stevo Voice iniciada com sucesso!",
    };
  });

