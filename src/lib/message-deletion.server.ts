/**
 * Message Deletion Runtime — Missão Inbox-Delete-01, Fase 2.
 *
 * Server-only orchestrator that:
 *  1. Loads the target message + channel.
 *  2. Detects the provider from the channel.
 *  3. Calls `dispatchDelete()` (single Provider Contract).
 *  4. Persists the outcome into columns created in Phase 1:
 *       - messages.deleted_at / deleted_by / deleted_scope / deleted_reason
 *       - messages.provider_delete_ack / provider_delete_error
 *     and inserts a `message_deletions` history row for full audit.
 *
 * IMPORTANT constraints (from mission scope):
 *  - No UI, no server functions, no event bus — those come in Phase 3/4.
 *  - Never marks the message as deleted locally when the provider was
 *    supposed to ACK and did not. `inbox_only` is always a local operation.
 *  - Retries are bounded: only when the provider returned `retryable=true`.
 *  - Every step is emitted through a structured logger (JSON lines) so
 *    the future observability wiring can consume it without changes here.
 *
 * The function returns the final `MessageDeletionResult` so callers
 * (Phase 3 server functions) can surface it to the user; it does not
 * throw on provider failures — the DB row keeps the error and the caller
 * decides how to present it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchDelete, type ChannelRow } from "./wa-providers/index.server";
import type {
  MessageDeletionResult,
  MessageDeletionScope,
} from "./wa-providers/deletion-contract.server";

export type DeleteMessageOptions = {
  supabase: SupabaseClient;
  messageId: string;
  companyId: string;
  actorId: string;
  scope: MessageDeletionScope;
  reason?: string | null;
  /**
   * Max attempts against the provider when the provider signals a
   * transient/retryable error. Defaults to 3.
   */
  maxAttempts?: number;
  /**
   * Millisecond delay between retry attempts (linear backoff).
   * Defaults to 500ms. Kept small — the runtime is not a long job.
   */
  retryDelayMs?: number;
  /**
   * Optional override for the dispatcher, primarily for tests.
   */
  dispatch?: (channel: ChannelRow | null, req: Parameters<typeof dispatchDelete>[1]) => Promise<MessageDeletionResult>;
  /**
   * Optional structured logger. Defaults to console.info with a stable
   * "inbox-delete" tag so log ingestion can filter deterministically.
   */
  logger?: (payload: Record<string, unknown>) => void;
};

export type DeleteMessageOutcome = {
  ok: boolean;
  scope: MessageDeletionScope;
  provider: string;
  provider_ack: boolean | null;
  attempts: number;
  duration_ms: number;
  error?: string;
  error_code?: string;
  message_id: string;
};

type MessageRow = {
  id: string;
  company_id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  provider_message_id: string | null;
  deleted_at: string | null;
};

type ConversationRow = {
  id: string;
  channel_id: string | null;
  contact: { phone: string | null } | null;
};

const defaultLogger = (payload: Record<string, unknown>): void => {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ tag: "inbox-delete", ...payload }));
};

/**
 * Delete a message with 3-level semantics + provider revoke when applicable.
 * Returns a normalized outcome; never throws on provider errors.
 */
export async function deleteMessage(opts: DeleteMessageOptions): Promise<DeleteMessageOutcome> {
  const {
    supabase,
    messageId,
    companyId,
    actorId,
    scope,
    reason = null,
    maxAttempts = 3,
    retryDelayMs = 500,
    dispatch = dispatchDelete,
    logger = defaultLogger,
  } = opts;

  const startedAt = Date.now();
  const log = (event: string, extra: Record<string, unknown> = {}) =>
    logger({
      event,
      message_id: messageId,
      company_id: companyId,
      actor_id: actorId,
      scope,
      ts: new Date().toISOString(),
      ...extra,
    });

  log("delete.start");

  // 1) Load the message (RLS scopes this to the caller's company already
  //    when supabase is the requireSupabaseAuth-bound client).
  const { data: mRaw, error: mErr } = await supabase
    .from("messages")
    .select("id, company_id, conversation_id, direction, provider_message_id, deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  if (mErr) {
    log("delete.load_message_error", { error: mErr.message });
    return failure({ scope, provider: "unknown", attempts: 0, startedAt, messageId, error: mErr.message, code: "load_error" });
  }
  const message = mRaw as unknown as MessageRow | null;
  if (!message) {
    log("delete.message_not_found");
    return failure({ scope, provider: "unknown", attempts: 0, startedAt, messageId, error: "Mensagem não encontrada.", code: "message_not_found" });
  }
  if (message.company_id !== companyId) {
    // RLS should already prevent this; belt-and-suspenders.
    log("delete.company_mismatch");
    return failure({ scope, provider: "unknown", attempts: 0, startedAt, messageId, error: "Mensagem pertence a outra empresa.", code: "auth_error" });
  }
  if (message.deleted_at) {
    // Idempotent: already deleted — do nothing but succeed.
    log("delete.already_deleted");
    return {
      ok: true,
      scope,
      provider: "noop",
      provider_ack: null,
      attempts: 0,
      duration_ms: Date.now() - startedAt,
      message_id: messageId,
    };
  }

  // 2) Load the conversation + channel so we know which provider to call.
  const { data: convRaw } = await supabase
    .from("conversations")
    .select("id, channel_id, contact:contacts(phone)")
    .eq("id", message.conversation_id)
    .maybeSingle();
  const conversation = convRaw as unknown as ConversationRow | null;

  let channel: ChannelRow | null = null;
  if (conversation?.channel_id) {
    const { data: chRaw } = await supabase
      .from("channels")
      .select("id, provider_type, credentials, phone_number")
      .eq("id", conversation.channel_id)
      .maybeSingle();
    channel = (chRaw ?? null) as ChannelRow | null;
  }

  // 3) Build the provider request. Use the peer's phone for outbound
  //    messages (recipient), or fall back to contact phone in both cases.
  const peerPhone = conversation?.contact?.phone ?? channel?.phone_number ?? null;
  const request = {
    scope,
    provider_message_id: message.provider_message_id,
    peer_phone: peerPhone,
    from_me: message.direction === "outbound",
    reason,
  };

  // 4) Call dispatch with retry loop (only for retryable failures).
  let attempts = 0;
  let result: MessageDeletionResult | null = null;
  const providerName = channel?.provider_type ?? "manual";
  for (attempts = 1; attempts <= Math.max(1, maxAttempts); attempts++) {
    log("delete.provider_attempt", { attempt: attempts, provider: providerName });
    result = await dispatch(channel, request);
    if (result.ok) {
      log("delete.provider_ok", {
        attempt: attempts,
        provider: result.provider,
        provider_ack: result.provider_ack,
        skipped: result.skipped ?? false,
      });
      break;
    }
    log("delete.provider_fail", {
      attempt: attempts,
      provider: result.provider,
      code: result.code,
      retryable: result.retryable,
      error: result.error,
    });
    if (!result.retryable || attempts >= maxAttempts) break;
    await sleep(retryDelayMs * attempts);
  }

  if (!result) {
    return failure({ scope, provider: providerName, attempts, startedAt, messageId, error: "Sem resultado do provider.", code: "internal_error" });
  }

  // 5) Persist outcome.
  //    Contract: never mark local success without ACK when the scope
  //    demanded a provider action.
  //    - inbox_only: always soft-delete locally (skipped=true, ack=null).
  //    - for_me / for_everyone with ok=true: soft-delete locally.
  //      * provider_delete_ack reflects real ACK (true / false / null).
  //    - ok=false: do NOT soft-delete; persist error in message_deletions
  //      history and on the message row without touching deleted_at.
  const nowIso = new Date().toISOString();

  if (result.ok) {
    const { error: updErr } = await supabase
      .from("messages")
      .update({
        deleted_at: nowIso,
        deleted_by: actorId,
        deleted_scope: scope,
        deleted_reason: reason,
        provider_delete_ack: result.provider_ack,
        provider_delete_error: null,
      } as never)
      .eq("id", messageId);
    if (updErr) {
      log("delete.persist_error", { error: updErr.message });
      return failure({ scope, provider: result.provider, attempts, startedAt, messageId, error: updErr.message, code: "persist_error" });
    }
  } else {
    // Preserve message integrity; annotate error columns for observability.
    const { error: updErr } = await supabase
      .from("messages")
      .update({
        provider_delete_ack: false,
        provider_delete_error: `${result.code}: ${result.error}`,
      } as never)
      .eq("id", messageId);
    if (updErr) log("delete.error_persist_warning", { error: updErr.message });
  }

  // History row — always append, success or failure.
  const { error: histErr } = await supabase
    .from("message_deletions")
    .insert({
      company_id: companyId,
      message_id: messageId,
      conversation_id: message.conversation_id,
      actor_id: actorId,
      scope,
      reason,
      provider_ack: result.ok ? result.provider_ack : false,
      provider_error: result.ok ? null : `${result.code}: ${result.error}`,
      provider_response: (result.ok ? result.response : result.response) ?? null,
    } as never);
  if (histErr) log("delete.history_persist_warning", { error: histErr.message });

  const duration_ms = Date.now() - startedAt;
  log("delete.done", {
    ok: result.ok,
    provider: result.provider,
    attempts,
    duration_ms,
    provider_ack: result.ok ? result.provider_ack : false,
  });

  if (result.ok) {
    return {
      ok: true,
      scope,
      provider: result.provider,
      provider_ack: result.provider_ack,
      attempts,
      duration_ms,
      message_id: messageId,
    };
  }
  return {
    ok: false,
    scope,
    provider: result.provider,
    provider_ack: false,
    attempts,
    duration_ms,
    error: result.error,
    error_code: result.code,
    message_id: messageId,
  };
}

function failure(args: {
  scope: MessageDeletionScope;
  provider: string;
  attempts: number;
  startedAt: number;
  messageId: string;
  error: string;
  code: string;
}): DeleteMessageOutcome {
  return {
    ok: false,
    scope: args.scope,
    provider: args.provider,
    provider_ack: null,
    attempts: args.attempts,
    duration_ms: Date.now() - args.startedAt,
    error: args.error,
    error_code: args.code,
    message_id: args.messageId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
