// Dispatcher: route send/delete calls to the right WhatsApp provider
// based on channel.provider_type.
import { sendViaWhatsAppCloud, type SendPayload, type SendResult, type WhatsAppCloudCreds } from "./whatsapp-cloud.server";
import {
  whatsappCloudDeletionProvider,
} from "./whatsapp-cloud-delete.server";
import {
  evolutionDeletionProvider,
  createEvolutionDeletionProvider,
} from "./evolution-delete.server";
import {
  baileysDeletionProvider,
  createBaileysDeletionProvider,
} from "./baileys-delete.server";
import type {
  MessageDeletionProvider,
  MessageDeletionRequest,
  MessageDeletionResult,
} from "./deletion-contract.server";

export type { SendPayload } from "./whatsapp-cloud.server";
export type {
  MessageDeletionRequest,
  MessageDeletionResult,
  MessageDeletionScope,
  MessageDeletionErrorCode,
} from "./deletion-contract.server";

export type ChannelRow = {
  id: string;
  provider_type: string | null;
  credentials: Record<string, unknown> | null;
  phone_number: string | null;
  company_id?: string;
};

export type DispatchResult =
  | { ok: true; provider_message_id: string | null; provider: string; request?: Record<string, unknown>; response?: unknown; http_status?: number; skipped?: boolean }
  | { ok: false; error: string; provider: string; request?: Record<string, unknown>; response?: unknown; http_status?: number };

/**
 * Send a message through the channel's configured provider.
 * When the channel has no real provider configured, returns { ok:true, skipped:true }
 * so the app-only inbox flow keeps working during onboarding/testing.
 */
export async function dispatchSend(channel: ChannelRow, payload: SendPayload): Promise<DispatchResult> {
  const provider = channel.provider_type ?? "manual";
  const creds = (channel.credentials ?? {}) as Record<string, unknown>;

  if (provider === "whatsapp_cloud") {
    const has = creds.phone_number_id && creds.access_token;
    if (!has) return { ok: true, provider_message_id: null, provider, skipped: true };
    const res: SendResult = await sendViaWhatsAppCloud(creds as WhatsAppCloudCreds, payload);
    if (res.ok) {
      return {
        ok: true,
        provider_message_id: res.provider_message_id,
        provider,
        request: res.request,
        response: res.response,
        http_status: res.http_status,
      };
    }
    return {
      ok: false,
      error: res.error,
      provider,
      request: res.request,
      response: res.response,
      http_status: res.http_status,
    };
  }

  if (provider === "stevo") {
    const { sendViaStevo, resolveStevoApiKey } = await import("./stevo.server");
    const stevoCreds = { ...creds, company_id: channel.company_id } as { instance_id?: string; api_key?: string; base_url?: string; company_id?: string };
    if (!stevoCreds.instance_id || !(await resolveStevoApiKey(stevoCreds))) {
      return { ok: true, provider_message_id: null, provider, skipped: true };
    }
    const res = await sendViaStevo(stevoCreds, payload);
    if (res.ok) {
      return {
        ok: true,
        provider_message_id: res.provider_message_id,
        provider,
        request: res.request,
        response: res.response,
        http_status: res.http_status,
      };
    }
    return {
      ok: false,
      error: res.error,
      provider,
      request: res.request,
      response: res.response,
      http_status: res.http_status,
    };
  }

  // Evolution / Baileys / manual — not implemented yet; treat as app-only
  return { ok: true, provider_message_id: null, provider, skipped: true };
}

// ---------------------------------------------------------------------------
// Deletion dispatcher (Missão Inbox-Delete-01, Fase 2)
// ---------------------------------------------------------------------------

const DELETION_PROVIDERS: Record<string, MessageDeletionProvider> = {
  whatsapp_cloud: whatsappCloudDeletionProvider,
  whatsapp_business: whatsappCloudDeletionProvider,
  evolution: evolutionDeletionProvider,
  baileys: baileysDeletionProvider,
};

/**
 * Route a deletion request to the correct provider adapter.
 *
 * `scope='inbox_only'` short-circuits without touching the provider even
 * when no channel/provider is available — inbox-only is a local operation.
 *
 * Channels without a recognized provider always return `skipped:true`
 * so the runtime can still mark the message as deleted-in-CRM without
 * corrupting state.
 */
export async function dispatchDelete(
  channel: ChannelRow | null,
  req: MessageDeletionRequest,
): Promise<MessageDeletionResult> {
  if (req.scope === "inbox_only") {
    return { ok: true, provider: channel?.provider_type ?? "manual", provider_ack: null, skipped: true };
  }
  const providerName = channel?.provider_type ?? "manual";
  const adapter = DELETION_PROVIDERS[providerName];
  if (!adapter) {
    // Manual / unknown provider: no revoke possible. Return skipped so
    // the caller can still soft-delete in the CRM.
    return { ok: true, provider: providerName, provider_ack: null, skipped: true };
  }
  const peerPhone = channel?.phone_number ?? null;
  return adapter.delete(channel?.credentials ?? null, peerPhone, req);
}

// Test-only: allow tests to inject a stub fetch without touching the
// real adapters used at runtime.
export function _createDispatchDeleteForTests(fetchImpl: typeof fetch) {
  const evo = createEvolutionDeletionProvider(fetchImpl);
  const bai = createBaileysDeletionProvider(fetchImpl);
  const providers: Record<string, MessageDeletionProvider> = {
    whatsapp_cloud: whatsappCloudDeletionProvider,
    whatsapp_business: whatsappCloudDeletionProvider,
    evolution: evo,
    baileys: bai,
  };
  return async (channel: ChannelRow | null, req: MessageDeletionRequest): Promise<MessageDeletionResult> => {
    if (req.scope === "inbox_only") {
      return { ok: true, provider: channel?.provider_type ?? "manual", provider_ack: null, skipped: true };
    }
    const providerName = channel?.provider_type ?? "manual";
    const adapter = providers[providerName];
    if (!adapter) return { ok: true, provider: providerName, provider_ack: null, skipped: true };
    return adapter.delete(channel?.credentials ?? null, channel?.phone_number ?? null, req);
  };
}

