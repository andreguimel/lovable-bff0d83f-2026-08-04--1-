// WhatsApp Cloud API (Meta) provider — server-only helper.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
import { createHmac, timingSafeEqual } from "crypto";

export type WhatsAppCloudCreds = {
  phone_number_id?: string;
  access_token?: string;
  app_secret?: string;
};

export type NormalizedInbound = {
  provider_message_id: string;
  from_phone: string;
  contact_name?: string;
  type: "text" | "image" | "audio" | "video" | "file";
  body?: string;
  media_url?: string;
  media_metadata?: Record<string, unknown>;
  timestamp?: string;
  /** WhatsApp Cloud `context.id` — the provider_message_id of the quoted message. */
  reply_to_provider_id?: string;
};

export type NormalizedStatus = {
  provider_message_id: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
};

const GRAPH = "https://graph.facebook.com/v20.0";

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  // Header format: sha256=<hex>
  const [scheme, sig] = signatureHeader.split("=");
  if (scheme !== "sha256" || !sig) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function fetchMediaUrl(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const r = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { url?: string };
    return j.url ?? null;
  } catch {
    return null;
  }
}

export async function normalizeMetaWebhook(
  payload: unknown,
  creds: WhatsAppCloudCreds,
): Promise<{ inbound: NormalizedInbound[]; statuses: NormalizedStatus[] }> {
  const inbound: NormalizedInbound[] = [];
  const statuses: NormalizedStatus[] = [];
  const p = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          messages?: Array<{
            id: string;
            from: string;
            type: string;
            timestamp?: string;
            text?: { body?: string };
            image?: { id?: string; mime_type?: string; caption?: string };
            audio?: { id?: string; mime_type?: string };
            video?: { id?: string; mime_type?: string; caption?: string };
            document?: { id?: string; mime_type?: string; filename?: string };
            context?: { id?: string };
          }>;
          statuses?: Array<{ id: string; status: string; errors?: Array<{ message?: string }> }>;
        };
      }>;
    }>;
  };

  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v) continue;
      const nameByWa = new Map<string, string>();
      for (const c of v.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nameByWa.set(c.wa_id, c.profile.name);
      }

      for (const m of v.messages ?? []) {
        let type: NormalizedInbound["type"] = "text";
        let body: string | undefined;
        let media_url: string | undefined;
        let media_metadata: Record<string, unknown> | undefined;

        if (m.type === "text") {
          body = m.text?.body;
        } else if (m.type === "image" && m.image?.id) {
          type = "image";
          const url = creds.access_token ? await fetchMediaUrl(m.image.id, creds.access_token) : null;
          media_url = url ?? undefined;
          media_metadata = { provider_media_id: m.image.id, mime: m.image.mime_type };
          body = m.image.caption;
        } else if (m.type === "audio" && m.audio?.id) {
          type = "audio";
          const url = creds.access_token ? await fetchMediaUrl(m.audio.id, creds.access_token) : null;
          media_url = url ?? undefined;
          media_metadata = { provider_media_id: m.audio.id, mime: m.audio.mime_type };
        } else if (m.type === "video" && m.video?.id) {
          type = "video";
          const url = creds.access_token ? await fetchMediaUrl(m.video.id, creds.access_token) : null;
          media_url = url ?? undefined;
          media_metadata = { provider_media_id: m.video.id, mime: m.video.mime_type };
          body = m.video.caption;
        } else if (m.type === "document" && m.document?.id) {
          type = "file";
          const url = creds.access_token ? await fetchMediaUrl(m.document.id, creds.access_token) : null;
          media_url = url ?? undefined;
          media_metadata = {
            provider_media_id: m.document.id,
            mime: m.document.mime_type,
            name: m.document.filename,
          };
        } else {
          // Unsupported types -> treat as text with placeholder
          type = "text";
          body = `[Mensagem do tipo ${m.type} não suportada]`;
        }

        inbound.push({
          provider_message_id: m.id,
          from_phone: m.from,
          contact_name: nameByWa.get(m.from),
          type,
          body,
          media_url,
          media_metadata,
          timestamp: m.timestamp,
          reply_to_provider_id: m.context?.id,
        });
      }

      for (const s of v.statuses ?? []) {
        const mapped: NormalizedStatus["status"] =
          s.status === "delivered" ? "delivered" : s.status === "read" ? "read" : s.status === "failed" ? "failed" : "sent";
        statuses.push({
          provider_message_id: s.id,
          status: mapped,
          error: s.errors?.[0]?.message,
        });
      }
    }
  }
  return { inbound, statuses };
}

export type SendPayload =
  | { type: "text"; to: string; body: string; replyToProviderId?: string }
  | { type: "image" | "video" | "file"; to: string; mediaUrl: string; caption?: string; filename?: string; replyToProviderId?: string }
  | { type: "audio"; to: string; mediaUrl: string; voice?: boolean; mime?: string; replyToProviderId?: string };

export type SendResult =
  | { ok: true; provider_message_id: string; request: Record<string, unknown>; response: unknown; http_status: number }
  | { ok: false; error: string; request: Record<string, unknown>; response?: unknown; http_status?: number };

export async function sendViaWhatsAppCloud(
  creds: WhatsAppCloudCreds,
  payload: SendPayload,
): Promise<SendResult> {
  if (!creds.phone_number_id || !creds.access_token) {
    return { ok: false, error: "Credenciais do WhatsApp Cloud não configuradas", request: {} };
  }
  const url = `${GRAPH}/${creds.phone_number_id}/messages`;

  let body: Record<string, unknown>;
  if (payload.type === "text") {
    body = { messaging_product: "whatsapp", to: payload.to, type: "text", text: { body: payload.body } };
  } else if (payload.type === "image") {
    body = { messaging_product: "whatsapp", to: payload.to, type: "image", image: { link: payload.mediaUrl, caption: payload.caption } };
  } else if (payload.type === "audio") {
    // PTT: WhatsApp Cloud API requires `voice: true` on the audio object.
    // Media must be OGG/Opus for real voice-message rendering; other MIMEs
    // still deliver as audio but may render as regular audio player.
    const audio: Record<string, unknown> = { link: payload.mediaUrl };
    if (payload.voice) audio.voice = true;
    body = { messaging_product: "whatsapp", to: payload.to, type: "audio", audio };
  } else if (payload.type === "video") {
    body = { messaging_product: "whatsapp", to: payload.to, type: "video", video: { link: payload.mediaUrl, caption: payload.caption } };
  } else {
    body = {
      messaging_product: "whatsapp",
      to: payload.to,
      type: "document",
      document: { link: payload.mediaUrl, filename: payload.filename },
    };
  }

  // Reply/quote: WhatsApp Cloud attaches context.message_id at the root
  // of the message payload. When present, the recipient sees the quoted
  // message pinned above the reply, native WhatsApp Web-style.
  if (payload.replyToProviderId) {
    body.context = { message_id: payload.replyToProviderId };
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };
    if (!r.ok) {
      return { ok: false, error: j.error?.message ?? `HTTP ${r.status}`, request: body, response: j, http_status: r.status };
    }
    const id = j.messages?.[0]?.id;
    if (!id) return { ok: false, error: "Resposta sem message id", request: body, response: j, http_status: r.status };
    return { ok: true, provider_message_id: id, request: body, response: j, http_status: r.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), request: body };
  }
}
