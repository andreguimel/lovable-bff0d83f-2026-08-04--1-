/**
 * Correlation utilities — permitem rastrear uma ação inteira
 * através de servidor, banco, provedores e UI.
 */

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Builds a metadata bag for audit_log / domain_events inserts.
 */
export function buildAuditMeta(overrides?: {
  correlation_id?: string;
  request_id?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  error_code?: string;
}) {
  return {
    correlation_id: overrides?.correlation_id ?? newCorrelationId(),
    request_id: overrides?.request_id ?? newRequestId(),
    session_id: overrides?.session_id ?? null,
    ip_address: overrides?.ip_address ?? null,
    user_agent: overrides?.user_agent ?? null,
    error_code: overrides?.error_code ?? null,
  };
}
