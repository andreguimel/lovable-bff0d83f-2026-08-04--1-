/**
 * Normalização de webhooks inbound da Stevo (engine SM v2 / Evolution).
 *
 * O servidor da instância entrega eventos em formatos ligeiramente diferentes
 * conforme a engine. Este módulo aceita os formatos conhecidos e devolve uma
 * lista canônica de mensagens recebidas + atualizações de status.
 */

export type StevoInboundMessage = {
  provider_message_id: string;
  from_phone: string;
  contact_name: string | null;
  type: "text" | "image" | "audio" | "video" | "file" | "reaction";
  body: string | null;
  media_url: string | null;
  media_metadata: Record<string, unknown> | null;
  reply_to_provider_id: string | null;
  from_me?: boolean;
  is_group?: boolean;
  group_jid?: string;
  sender_name?: string | null;
  sender_phone?: string | null;
};

export type StevoStatusUpdate = {
  provider_message_id: string;
  status: "delivered" | "read" | "failed";
  error?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** `5511999999999@s.whatsapp.net` / `55…@c.us` → `5511999999999` */
function jidToPhone(jid: string | null): string | null {
  if (!jid) return null;
  const base = jid.split("@")[0]?.split(":")[0] ?? "";
  const digits = base.replace(/[^0-9]/g, "");
  return digits || null;
}

function isGroupJid(jid: string | null): boolean {
  return !!jid && (jid.includes("@g.us") || jid.includes("@broadcast"));
}

/** Extrai texto e mídia de um objeto `message` do WhatsApp (Baileys/whatsmeow). */
function readContent(message: Record<string, unknown>): {
  type: StevoInboundMessage["type"];
  body: string | null;
  media_url: string | null;
  media_metadata: Record<string, unknown> | null;
} {
  const reactionNode = message.reactionMessage ?? message.ReactionMessage;
  if (reactionNode) {
    const r = asRecord(reactionNode);
    const targetKey = asRecord(r.key ?? r.Key);
    const targetId = str(targetKey.id) ?? str(r.messageId) ?? str(r.targetMessageId);
    const emoji = str(r.text) ?? str(r.emoji) ?? "";
    if (targetId) {
      return {
        type: "reaction",
        body: emoji,
        media_url: null,
        media_metadata: { reaction_target_provider_id: targetId, emoji },
      };
    }
  }

  const conversation =
    str(message.conversation) ??
    str(asRecord(message.extendedTextMessage).text) ??
    str(message.Conversation) ??
    str(asRecord(message.ExtendedTextMessage).text) ??
    str(message.text) ??
    str(message.body);
  if (conversation) {
    return { type: "text", body: conversation, media_url: null, media_metadata: null };
  }

  const kinds: Array<[string, StevoInboundMessage["type"]]> = [
    ["imageMessage", "image"],
    ["ImageMessage", "image"],
    ["audioMessage", "audio"],
    ["AudioMessage", "audio"],
    ["videoMessage", "video"],
    ["VideoMessage", "video"],
    ["documentMessage", "file"],
    ["DocumentMessage", "file"],
    ["stickerMessage", "image"],
  ];
  for (const [key, type] of kinds) {
    const node = message[key];
    if (node) {
      const n = asRecord(node);
      return {
        type,
        body: str(n.caption) ?? str(n.Caption),
        media_url: str(n.url) ?? str(n.URL) ?? str(n.mediaUrl) ?? str(n.directPath) ?? null,
        media_metadata: {
          mimetype: str(n.mimetype) ?? str(n.Mimetype) ?? null,
          filename: str(n.fileName) ?? str(n.FileName) ?? null,
          mediaKey: str(n.mediaKey) ?? str(n.MediaKey) ?? null,
          directPath: str(n.directPath) ?? str(n.DirectPath) ?? null,
          is_voice: n.ptt === true || n.PTT === true,
          seconds: typeof n.seconds === "number" ? n.seconds : null,
        },
      };
    }
  }

  return { type: "text", body: null, media_url: null, media_metadata: null };
}

const STATUS_MAP: Record<string, StevoStatusUpdate["status"]> = {
  delivery_ack: "delivered",
  delivered: "delivered",
  DELIVERY_ACK: "delivered",
  read: "read",
  READ: "read",
  played: "read",
  error: "failed",
  failed: "failed",
  ERROR: "failed",
};

function extractItems(root: Record<string, unknown>): Record<string, unknown>[] {
  const candidates: unknown[] = [
    root.data,
    root.event,
    root.payload,
    root.messages,
    asRecord(root.data).messages,
    asRecord(root.event).messages,
    asRecord(root.payload).messages,
  ];

  const items: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();

  for (const c of candidates) {
    if (Array.isArray(c)) {
      for (const item of c) {
        if (item && typeof item === "object" && !seen.has(asRecord(item))) {
          const rec = asRecord(item);
          seen.add(rec);
          items.push(rec);
        }
      }
    } else if (c && typeof c === "object" && Object.keys(c).length > 0 && !seen.has(asRecord(c))) {
      const rec = asRecord(c);
      seen.add(rec);
      items.push(rec);
    }
  }

  if (items.length === 0) items.push(root);
  return items;
}

/**
 * Converte o corpo de um webhook da Stevo em mensagens inbound + status.
 * Ignora grupos, mensagens próprias (fromMe) e eventos desconhecidos.
 */
export function normalizeStevoWebhook(payload: unknown): {
  inbound: StevoInboundMessage[];
  statuses: StevoStatusUpdate[];
} {
  const root = asRecord(payload);
  const eventType = (str(root.type) ?? str(root.event) ?? str(root.Event) ?? "").toLowerCase();

  const inbound: StevoInboundMessage[] = [];
  const statuses: StevoStatusUpdate[] = [];
  const items = extractItems(root);

  for (const event of items) {
    // --- Receipts / status de entrega ---
    const receipt = asRecord(event.Receipt ?? event.receipt);
    const receiptType = str(receipt.Type) ?? str(receipt.type) ?? (eventType.includes("receipt") ? "delivered" : null);
    const receiptIds = (receipt.MessageIDs ?? receipt.messageIds ?? receipt.ids) as unknown;
    if (receiptType && Array.isArray(receiptIds)) {
      const mapped = STATUS_MAP[receiptType] ?? "delivered";
      for (const id of receiptIds) {
        const pid = str(id);
        if (pid) statuses.push({ provider_message_id: pid, status: mapped });
      }
    }
    const singleStatus = str(event.status) ?? str(root.status);
    const singleId = str(asRecord(event.key).id) ?? str(event.id) ?? str(event.messageId);
    if (singleStatus && singleId && STATUS_MAP[singleStatus]) {
      statuses.push({ provider_message_id: singleId, status: STATUS_MAP[singleStatus]! });
    }

    // --- Mensagem recebida ---
    const info = asRecord(event.Info ?? event.info);
    const key = asRecord(event.key ?? event.Key);
    const message = asRecord(event.Message ?? event.message);

    const fromMe = info.IsFromMe === true || key.fromMe === true || event.fromMe === true || root.fromMe === true;
    const chatJid =
      str(info.Chat) ??
      str(info.Sender) ??
      str(key.remoteJid) ??
      str(event.remoteJid) ??
      str(event.from) ??
      str(event.chatJid) ??
      str(root.remoteJid) ??
      str(root.from) ??
      str(root.chatJid) ??
      null;
    const senderJid = str(info.Sender) ?? str(key.participant) ?? str(event.sender) ?? str(root.sender) ?? chatJid;

    const providerId = str(info.ID) ?? str(info.Id) ?? str(key.id) ?? str(event.id) ?? str(event.messageId) ?? str(root.id) ?? null;

    // Suporte a mensagens aninhadas ou planas (flat payload)
    let content = readContent(message);
    const directReaction = asRecord(event.reaction ?? root.reaction);
    if (content.type !== "reaction" && Object.keys(directReaction).length > 0) {
      const targetId = str(directReaction.messageId) ?? str(directReaction.targetMessageId) ?? str(asRecord(directReaction.key).id);
      const emoji = str(directReaction.text) ?? str(directReaction.emoji) ?? str(directReaction.value) ?? "";
      if (targetId) {
        content = {
          type: "reaction",
          body: emoji,
          media_url: null,
          media_metadata: { reaction_target_provider_id: targetId, emoji },
        };
      }
    }

    if (!content.body && !content.media_url && content.type !== "reaction") {
      const flatBody = str(event.body) ?? str(event.text) ?? str(event.content) ?? str(root.body) ?? str(root.text) ?? str(root.content);
      const flatMedia = str(event.media_url) ?? str(event.mediaUrl) ?? str(event.url) ?? str(root.media_url) ?? str(root.mediaUrl) ?? str(root.url);
      const rawType = (str(event.type) ?? str(event.messageType) ?? str(root.type) ?? "text").toLowerCase();
      const type: StevoInboundMessage["type"] =
        rawType.includes("image") ? "image" : rawType.includes("audio") ? "audio" : rawType.includes("video") ? "video" : rawType.includes("doc") || rawType.includes("file") ? "file" : "text";

      if (flatBody || flatMedia) {
        content = { type, body: flatBody, media_url: flatMedia, media_metadata: null };
      }
    }

    const hasMessage = Object.keys(message).length > 0 || !!content.body || !!content.media_url || content.type === "reaction";

    const isGroup = isGroupJid(chatJid);
    if (hasMessage && providerId && chatJid) {
      const phone = jidToPhone(isGroup ? chatJid : (fromMe ? chatJid : (senderJid ?? chatJid)));
      if (phone) {
        const ctx = asRecord(
          asRecord(message.extendedTextMessage).contextInfo ?? asRecord(message.ExtendedTextMessage).contextInfo ?? event.contextInfo ?? root.contextInfo,
        );
        const pushName = str(info.PushName) ?? str(event.pushName) ?? str(event.pushname) ?? str(root.pushName) ?? str(root.pushname) ?? null;
        const senderPhone = jidToPhone(senderJid);

        const meta = {
          ...(content.media_metadata ?? {}),
          ...(isGroup ? { is_group: true, sender_name: pushName, sender_phone: senderPhone } : {}),
        };

        inbound.push({
          provider_message_id: providerId,
          from_phone: phone,
          contact_name: isGroup ? null : (fromMe ? null : pushName),
          type: content.type,
          body: content.body,
          media_url: content.media_url,
          media_metadata: meta,
          reply_to_provider_id: str(ctx.stanzaId) ?? str(ctx.stanzaID) ?? null,
          from_me: fromMe,
          is_group: isGroup,
          group_jid: isGroup ? chatJid : undefined,
          sender_name: pushName,
          sender_phone: senderPhone,
        });
      }
    }
  }

  return { inbound, statuses };
}
