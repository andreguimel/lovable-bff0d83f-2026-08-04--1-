/**
 * MessageDeletionProvider — Provider Contract (Missão Inbox-Delete-01, Fase 2).
 *
 * Server-only unified interface for message deletion across the three
 * WhatsApp providers currently supported by Zenda:
 *
 *   - WhatsApp Cloud API (Meta)
 *   - Evolution API
 *   - Baileys (via HTTP proxy)
 *
 * Design goals:
 *  - **One contract, three adapters.** Runtime callers never branch on
 *    `provider_type`; they call `dispatchDelete()` and receive a normalized
 *    `MessageDeletionResult`.
 *  - **Never lie about provider ACK.** When the provider does not confirm
 *    the revoke (or does not support it), `provider_ack` is either `false`
 *    or `null`. `true` is only set when we have real evidence.
 *  - **Standardized error codes.** Callers can decide retry / fallback
 *    based on the `code`, without parsing free-form provider strings.
 *  - **No side-effects on failure.** A failed provider call must not
 *    corrupt the message row — the runtime module owns the DB update and
 *    only touches columns already created in Phase 1.
 *
 * This module has zero DB access. It only speaks HTTP to providers.
 */

/**
 * The three levels of deletion defined in the Phase 1 enum
 * (`public.message_deletion_scope`).
 *
 *  - `inbox_only`   : Never touches the provider. UI-only hide.
 *  - `for_me`       : Removes on the company's device/session; the client
 *                     still sees the message. Not all providers expose
 *                     this — for those, we treat as `inbox_only` from
 *                     the provider's perspective (no HTTP call).
 *  - `for_everyone` : Sends the provider's revoke primitive. Impacts the
 *                     end customer. Rejected when the provider does not
 *                     support revoke (WhatsApp Cloud today).
 */
export type MessageDeletionScope = "inbox_only" | "for_me" | "for_everyone";

/**
 * Standardized error codes returned by adapters. Callers can rely on
 * these to decide retry/fallback without parsing free-form provider text.
 */
export type MessageDeletionErrorCode =
  /** Provider does not support this scope at all (e.g. Cloud + for_everyone). */
  | "unsupported_scope"
  /** Provider credentials missing/invalid on the channel row. */
  | "missing_credentials"
  /** Provider returned an authentication failure (401/403). Do NOT retry. */
  | "auth_error"
  /** Provider says the message id is unknown / already gone. Do NOT retry. */
  | "message_not_found"
  /** Provider revoke window expired (WhatsApp's ~2 day rule). Do NOT retry. */
  | "revoke_window_expired"
  /** Network/5xx/timeout. Safe to retry. */
  | "transient"
  /** Provider returned an error we could not classify. Do NOT retry by default. */
  | "provider_error"
  /** Payload is malformed (missing `provider_message_id`, etc). Do NOT retry. */
  | "invalid_payload";

export type MessageDeletionRequest = {
  scope: MessageDeletionScope;
  /** WhatsApp message id assigned by the provider (from `messages.provider_message_id`). */
  provider_message_id: string | null;
  /** E.164-ish phone of the peer. Required by some providers (Evolution/Baileys). */
  peer_phone: string | null;
  /**
   * Whether the message was sent by the company (outbound). Some providers
   * only allow revoking own outbound messages.
   */
  from_me: boolean;
  /** Optional free-form reason (audit only, not sent to the provider). */
  reason?: string | null;
};

export type MessageDeletionSuccess = {
  ok: true;
  provider: string;
  /**
   * `true` when we have positive confirmation from the provider,
   * `false` when the call succeeded but the provider does not signal ACK,
   * `null` when no provider call was made (scope='inbox_only').
   */
  provider_ack: boolean | null;
  request?: Record<string, unknown>;
  response?: unknown;
  http_status?: number;
  /** Set when the adapter deliberately skipped the provider call (inbox_only). */
  skipped?: boolean;
};

export type MessageDeletionFailure = {
  ok: false;
  provider: string;
  code: MessageDeletionErrorCode;
  error: string;
  request?: Record<string, unknown>;
  response?: unknown;
  http_status?: number;
  /**
   * True when the runtime SHOULD retry with backoff (transient errors only).
   * Adapters set this explicitly so retry policy is not derived from the
   * code enum by consumers.
   */
  retryable: boolean;
};

export type MessageDeletionResult = MessageDeletionSuccess | MessageDeletionFailure;

/**
 * The single method every provider must implement.
 *
 * Adapters MUST:
 *  - Return `ok:true, skipped:true, provider_ack:null` for `scope='inbox_only'`
 *    without any network call.
 *  - Return `ok:false, code:'unsupported_scope', retryable:false` when the
 *    provider cannot honor the requested scope (never a partial success).
 *  - Never throw — wrap network errors into `ok:false, code:'transient'`.
 */
export type MessageDeletionProvider = {
  readonly provider: string;
  delete(
    creds: Record<string, unknown> | null,
    peerPhone: string | null,
    req: MessageDeletionRequest,
  ): Promise<MessageDeletionResult>;
};

// ---------------------------------------------------------------------------
// Small helpers reused by adapters and tests.
// ---------------------------------------------------------------------------

export function skippedResult(provider: string): MessageDeletionSuccess {
  return { ok: true, provider, provider_ack: null, skipped: true };
}

export function unsupportedScope(
  provider: string,
  scope: MessageDeletionScope,
  reason: string,
): MessageDeletionFailure {
  return {
    ok: false,
    provider,
    code: "unsupported_scope",
    error: `Provider ${provider} não suporta scope=${scope}: ${reason}`,
    retryable: false,
  };
}

export function missingCredentials(provider: string, detail: string): MessageDeletionFailure {
  return {
    ok: false,
    provider,
    code: "missing_credentials",
    error: `Credenciais ausentes para ${provider}: ${detail}`,
    retryable: false,
  };
}

export function invalidPayload(provider: string, detail: string): MessageDeletionFailure {
  return {
    ok: false,
    provider,
    code: "invalid_payload",
    error: `Payload inválido para ${provider}: ${detail}`,
    retryable: false,
  };
}

/**
 * Map an HTTP status + optional provider body into a normalized failure.
 * Kept generic so all HTTP-based adapters share the same classification.
 */
export function classifyHttpFailure(
  provider: string,
  status: number,
  body: unknown,
): MessageDeletionFailure {
  const raw = extractProviderMessage(body);
  const message = raw || `HTTP ${status}`;
  if (status === 401 || status === 403) {
    return {
      ok: false,
      provider,
      code: "auth_error",
      error: message,
      http_status: status,
      response: body,
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      ok: false,
      provider,
      code: "message_not_found",
      error: message,
      http_status: status,
      response: body,
      retryable: false,
    };
  }
  if (status === 408 || status === 429 || status >= 500) {
    return {
      ok: false,
      provider,
      code: "transient",
      error: message,
      http_status: status,
      response: body,
      retryable: true,
    };
  }
  if (/expired|window|too old/i.test(message)) {
    return {
      ok: false,
      provider,
      code: "revoke_window_expired",
      error: message,
      http_status: status,
      response: body,
      retryable: false,
    };
  }
  return {
    ok: false,
    provider,
    code: "provider_error",
    error: message,
    http_status: status,
    response: body,
    retryable: false,
  };
}

function extractProviderMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const err = (b.error ?? b.message ?? b.detail) as unknown;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.detail === "string") return e.detail;
  }
  return null;
}
