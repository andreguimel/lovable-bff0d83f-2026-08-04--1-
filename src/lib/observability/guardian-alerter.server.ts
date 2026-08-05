/**
 * Guardian External Alerter — envia notificações para webhook externo
 * (Slack, Discord, Teams, endpoint próprio) quando o Guardião cria um
 * incidente relevante.
 *
 * Design (Fase 1.5B — OBS-H-01):
 *  - Configuração 100% via env vars. Zero acoplamento com o Runtime.
 *  - Fail-safe: qualquer erro é registrado em guardian_runs, nunca propaga
 *    para o caller (o Guardião não deve travar por causa do alerter).
 *  - Deduplicação: apenas incidentes NOVOS geram alerta. Dedupe por
 *    fingerprint + janela em memória (kill-switch por processo) + registro
 *    persistente em guardian_runs.action='alertSent'.
 *  - Rate limit: máximo N alertas/minuto por fingerprint e global, via
 *    token bucket em memória (suficiente para 1 worker; no piloto WebMarcas
 *    a superfície de tráfego é única).
 *  - Severidade mínima: default 'critical'; ajustável por env.
 *
 * Não altera Runtime, Scheduler, Providers, Event Bus, RBAC, RLS.
 */

type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface AlertPayload {
  incidentId: string;
  companyId: string;
  kind: string;
  severity: Severity | string;
  message: string;
  route?: string | null;
  fingerprint?: string | null;
  source?: "cron" | "reporter" | "manual" | string;
  context?: Record<string, unknown> | null;
}

interface AlerterConfig {
  enabled: boolean;
  webhookUrl: string | null;
  minSeverity: Severity;
  perFingerprintCooldownMs: number;
  globalMaxPerMinute: number;
  timeoutMs: number;
  environmentLabel: string;
}

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function readConfig(): AlerterConfig {
  const raw = (process.env.GUARDIAN_ALERT_MIN_SEVERITY ?? "critical").toLowerCase();
  const minSeverity = (["info", "low", "medium", "high", "critical"].includes(raw) ? raw : "critical") as Severity;
  const url = process.env.GUARDIAN_ALERT_WEBHOOK_URL?.trim() || null;
  const enabled = (process.env.GUARDIAN_ALERT_ENABLED ?? "").toLowerCase() === "true" && !!url;
  const cooldown = Math.max(0, Number(process.env.GUARDIAN_ALERT_COOLDOWN_MS ?? 300_000)); // 5 min
  const maxPerMin = Math.max(1, Number(process.env.GUARDIAN_ALERT_MAX_PER_MIN ?? 12));
  const timeout = Math.max(500, Number(process.env.GUARDIAN_ALERT_TIMEOUT_MS ?? 4_000));
  const envLabel = process.env.GUARDIAN_ALERT_ENV_LABEL ?? "prod";
  return {
    enabled,
    webhookUrl: url,
    minSeverity,
    perFingerprintCooldownMs: cooldown,
    globalMaxPerMinute: maxPerMin,
    timeoutMs: timeout,
    environmentLabel: envLabel,
  };
}

// ────────────────────────────────────────────────────────────────
// In-memory dedupe + rate limit (por worker/instância)
// ────────────────────────────────────────────────────────────────
const lastSentByFingerprint = new Map<string, number>();
const globalWindow: number[] = []; // timestamps dos alertas do último minuto

function checkRate(fingerprint: string | null | undefined, cfg: AlerterConfig): { allowed: boolean; reason?: string } {
  const now = Date.now();

  // Global: janela deslizante de 60s
  while (globalWindow.length && now - globalWindow[0] > 60_000) globalWindow.shift();
  if (globalWindow.length >= cfg.globalMaxPerMinute) {
    return { allowed: false, reason: "global_rate_limit" };
  }

  // Por fingerprint: cooldown
  if (fingerprint) {
    const last = lastSentByFingerprint.get(fingerprint);
    if (last && now - last < cfg.perFingerprintCooldownMs) {
      return { allowed: false, reason: "fingerprint_cooldown" };
    }
  }

  return { allowed: true };
}

function markSent(fingerprint: string | null | undefined) {
  const now = Date.now();
  globalWindow.push(now);
  if (fingerprint) lastSentByFingerprint.set(fingerprint, now);
}

// ────────────────────────────────────────────────────────────────
// Payload builder (Slack-compatível; funciona também com Discord e
// endpoints genéricos que aceitem JSON arbitrário).
// ────────────────────────────────────────────────────────────────
function buildWebhookBody(p: AlertPayload, cfg: AlerterConfig): Record<string, unknown> {
  const emoji = p.severity === "critical" ? "🚨" : p.severity === "high" ? "⚠️" : "ℹ️";
  const title = `${emoji} [Guardião · ${cfg.environmentLabel}] ${String(p.severity).toUpperCase()} — ${p.kind}`;
  const lines = [
    `*${title}*`,
    `> ${p.message}`,
    `• Empresa: \`${p.companyId}\``,
    `• Incidente: \`${p.incidentId}\``,
    p.route ? `• Rota: ${p.route}` : null,
    p.fingerprint ? `• Fingerprint: \`${p.fingerprint}\`` : null,
    p.source ? `• Fonte: ${p.source}` : null,
  ].filter(Boolean);
  return {
    // Slack Incoming Webhook
    text: lines.join("\n"),
    // Estrutura genérica (Discord / endpoints próprios)
    guardian: {
      env: cfg.environmentLabel,
      severity: p.severity,
      kind: p.kind,
      message: p.message,
      incidentId: p.incidentId,
      companyId: p.companyId,
      route: p.route ?? null,
      fingerprint: p.fingerprint ?? null,
      source: p.source ?? null,
      timestamp: new Date().toISOString(),
    },
  };
}

async function postWithTimeout(url: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number; error?: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Dispara um alerta externo se:
 *  - alerter está habilitado;
 *  - severidade ≥ mínima configurada;
 *  - não bateu rate limit / cooldown;
 *  - é um incidente novo (o caller deve chamar apenas em novas inserções).
 *
 * Nunca lança. Registra o resultado (ok, skip, error) em guardian_runs
 * quando um cliente admin for fornecido.
 */
export async function sendGuardianAlert(
  payload: AlertPayload,
  supabaseAdmin?: { from: (t: string) => any },
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const cfg = readConfig();

  if (!cfg.enabled || !cfg.webhookUrl) {
    return { sent: false, skipped: "disabled" };
  }

  const sevRank = SEVERITY_RANK[String(payload.severity).toLowerCase()] ?? 0;
  const minRank = SEVERITY_RANK[cfg.minSeverity];
  if (sevRank < minRank) {
    return { sent: false, skipped: "below_min_severity" };
  }

  const rate = checkRate(payload.fingerprint, cfg);
  if (!rate.allowed) {
    await auditRun(supabaseAdmin, payload, { sent: false, reason: rate.reason });
    return { sent: false, skipped: rate.reason };
  }

  const body = buildWebhookBody(payload, cfg);
  const result = await postWithTimeout(cfg.webhookUrl, body, cfg.timeoutMs);

  if (result.ok) {
    markSent(payload.fingerprint);
    await auditRun(supabaseAdmin, payload, { sent: true, status: result.status });
    return { sent: true };
  }

  await auditRun(supabaseAdmin, payload, { sent: false, status: result.status, error: result.error });
  return { sent: false, error: result.error ?? `HTTP ${result.status}` };
}

async function auditRun(
  supabaseAdmin: { from: (t: string) => any } | undefined,
  payload: AlertPayload,
  result: Record<string, unknown>,
) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("guardian_runs").insert({
      company_id: payload.companyId,
      action: "alertSent",
      status: result.sent ? "ok" : "warning",
      payload: {
        incidentId: payload.incidentId,
        kind: payload.kind,
        severity: payload.severity,
        fingerprint: payload.fingerprint,
        source: payload.source,
      },
      result,
    });
  } catch {
    // silencioso — auditoria é best-effort
  }
}

/** Utilitário para health check / painel exibir estado atual do alerter. */
export function describeAlerterConfig(): {
  enabled: boolean;
  hasWebhook: boolean;
  minSeverity: Severity;
  cooldownMs: number;
  globalMaxPerMinute: number;
  environmentLabel: string;
} {
  const cfg = readConfig();
  return {
    enabled: cfg.enabled,
    hasWebhook: !!cfg.webhookUrl,
    minSeverity: cfg.minSeverity,
    cooldownMs: cfg.perFingerprintCooldownMs,
    globalMaxPerMinute: cfg.globalMaxPerMinute,
    environmentLabel: cfg.environmentLabel,
  };
}
