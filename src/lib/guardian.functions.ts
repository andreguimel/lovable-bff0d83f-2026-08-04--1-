import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertReadOnlySql,
  buildGuardianScan,
  getCurrentCompanyId,
  requireGuardianAdmin,
  safeRows,
} from "@/lib/guardian.server";
import type { GuardianScanResult } from "@/lib/guardian.types";

const overviewInput = z.object({
  windowHours: z.number().int().optional(),
});

export const guardianScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const scan = await buildGuardianScan(ctx.supabase, companyId);

    const { error } = await ctx.supabase.from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: "scan",
      status: scan.status === "critical" ? "warning" : "ok",
      payload: { source: "manual_or_refresh" },
      result: {
        status: scan.status,
        score: scan.score,
        incidentCount: scan.incidents.length,
        criticalCount: scan.incidents.filter((i) => i.severity === "critical").length,
      },
    });
    if (error) throw new Error(error.message);

    // Snapshot histórico para o sparkline do painel.
    await ctx.supabase.from("guardian_health_snapshots").insert({
      company_id: companyId,
      status: scan.status,
      score: scan.score,
      health: scan.health as any,
      incident_count: scan.incidents.length,
      critical_count: scan.incidents.filter((i) => i.severity === "critical").length,
      source: "manual",
    });
    return scan;

  });

export const guardianOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof overviewInput> | undefined) => overviewInput.parse(i ?? {}))
  .handler(async ({ context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const scan = await buildGuardianScan(ctx.supabase, companyId);
    return scan;
  });

export const guardianHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const scan = await buildGuardianScan(ctx.supabase, companyId);
    return scan.health;
  });

const sqlInput = z.object({ sql: z.string() });

export const guardianRunSelect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof sqlInput>) => sqlInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const cleaned = assertReadOnlySql(data.sql);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const wrapped = `SELECT * FROM (${cleaned}) AS q LIMIT 200`;
    const res = await (supabaseAdmin as any).rpc("exec_read_sql", { p_sql: wrapped });
    if (res.error) throw new Error(`Não foi possível executar SELECT: ${res.error.message}`);
    const rows = Array.isArray(res.data) ? res.data : [res.data].filter(Boolean);

    await (supabaseAdmin as any).from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: "runReadOnlySql",
      status: "ok",
      payload: { sql: data.sql },
      result: { rowCount: rows.length },
    });

    return { rows: safeRows<Record<string, string | number | boolean | null>>(rows).slice(0, 200) };
  });

export const guardianAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const { data, error } = await ctx.supabase
      .from("guardian_runs")
      .select("id, action, status, error, created_at, result")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return {
      rows: safeRows<Record<string, string | number | boolean | null>>(
        (data ?? []).map((row: any) => ({
          id: row.id,
          action: row.action,
          status: row.status,
          error: row.error,
          created_at: row.created_at,
          result: row.result ? JSON.stringify(row.result).slice(0, 180) : null,
        })),
      ),
    };
  });

export const guardianResendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { messageId: string }) => z.object({ messageId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);

    const { data: message, error: readError } = await ctx.supabase
      .from("messages")
      .select("id, company_id, conversation_id, direction, type, body, media_url, media_metadata, retry_count")
      .eq("id", data.messageId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!message) throw new Error("Mensagem não encontrada.");
    if (message.direction !== "outbound") throw new Error("Somente mensagens de saída podem ser reenviadas.");

    const { data: conv, error: convErr } = await ctx.supabase
      .from("conversations")
      .select("company_id, channel_id, contact:contacts(phone), channel:channels!channel_id(id, provider_type, credentials, phone_number)")
      .eq("id", message.conversation_id)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversa da mensagem não encontrada.");

    const toPhoneRaw = (conv.contact as { phone?: string } | null)?.phone ?? "";
    const toPhone = toPhoneRaw.replace(/^\+/, "").replace(/\D/g, "");
    const channel = conv.channel as {
      id: string;
      provider_type: string | null;
      credentials: Record<string, unknown> | null;
      phone_number: string | null;
    } | null;

    let providerMessageId: string | null = null;
    let sendError: string | null = null;
    if (!channel || !toPhone) {
      sendError = "Canal ou telefone do contato indisponível.";
    } else {
      const { dispatchSend } = await import("@/lib/wa-providers/index.server");
      const mediaMeta = (message.media_metadata ?? {}) as Record<string, unknown>;
      const msgType = String(message.type);
      const payload =
        msgType === "text"
          ? { type: "text" as const, to: toPhone, body: message.body ?? "" }
          : msgType === "image"
            ? { type: "image" as const, to: toPhone, mediaUrl: message.media_url ?? "", caption: message.body ?? undefined }
            : msgType === "audio"
              ? { type: "audio" as const, to: toPhone, mediaUrl: message.media_url ?? "" }
              : msgType === "video"
                ? { type: "video" as const, to: toPhone, mediaUrl: message.media_url ?? "", caption: message.body ?? undefined }
                : {
                    type: "file" as const,
                    to: toPhone,
                    mediaUrl: message.media_url ?? "",
                    filename: (mediaMeta.name as string | undefined) ?? (mediaMeta.filename as string | undefined) ?? "arquivo",
                  };
      const res = await dispatchSend(
        {
          id: channel.id,
          provider_type: channel.provider_type,
          credentials: channel.credentials ?? {},
          phone_number: channel.phone_number,
        },
        payload,
      );
      if (res.ok) providerMessageId = res.provider_message_id;
      else sendError = res.error;
    }

    const retryCount = Number(message.retry_count ?? 0) + 1;
    const mergedMeta = {
      ...((message.media_metadata ?? {}) as Record<string, unknown>),
      guardian_retry_at: new Date().toISOString(),
      ...(sendError ? { send_error: sendError } : {}),
    };
    const { error: updateError } = await ctx.supabase
      .from("messages")
      .update({
        status: sendError ? "failed" : "sent",
        provider_message_id: providerMessageId,
        error: sendError,
        failed_at: sendError ? new Date().toISOString() : null,
        retry_count: retryCount,
        media_metadata: mergedMeta,
      })
      .eq("id", data.messageId)
      .eq("company_id", companyId);
    if (updateError) throw new Error(updateError.message);

    await ctx.supabase.from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: "resendMessage",
      status: sendError ? "failed" : "ok",
      error: sendError,
      payload: { messageId: data.messageId },
      result: { ok: !sendError, retry_count: retryCount, providerMessageId },
    });

    if (sendError) throw new Error(sendError);
    return { ok: true, retry_count: retryCount, providerMessageId };
  });

export const guardianRetryFlowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);

    const { data: run, error: readError } = await ctx.supabase
      .from("flow_runs")
      .select("id, company_id, flow_id, conversation_id, channel_id, variables, is_test")
      .eq("id", data.runId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!run) throw new Error("Execução de fluxo não encontrada.");

    const now = new Date().toISOString();
    const { error: updateError } = await ctx.supabase
      .from("flow_runs")
      .update({
        status: "queued",
        error: null,
        completed_at: null,
        cursor_node_id: null,
        started_at: now,
      })
      .eq("id", data.runId)
      .eq("company_id", companyId);
    if (updateError) throw new Error(updateError.message);

    await ctx.supabase.from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: "retryFlowRun",
      status: "ok",
      payload: { runId: data.runId, flowId: run.flow_id, conversationId: run.conversation_id },
      result: { ok: true, queued: true },
    });

    return { ok: true, queued: true };
  });

export const guardianToggleIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; enabled: boolean }) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const { error } = await ctx.supabase
      .from("integrations")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    await ctx.supabase.from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: data.enabled ? "enableIntegration" : "disableIntegration",
      status: "ok",
      payload: { integrationId: data.id },
      result: { enabled: data.enabled },
    });
    return { ok: true };
  });

export const guardianChatHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const { data, error } = await ctx.supabase
      .from("guardian_runs")
      .select("id, created_at, payload, result")
      .eq("company_id", companyId)
      .eq("action", "chat")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const last = (data ?? [])[0];
    if (!last) return { messages: [] as Array<{ role: string; content: string }> };
    const payloadMsgs =
      ((last.payload as { messages?: Array<{ role: string; content: string }> })?.messages ?? []) as Array<{
        role: string;
        content: string;
      }>;
    const answer = (last.result as { text?: string })?.text;
    return { messages: [...payloadMsgs, ...(answer ? [{ role: "assistant" as const, content: answer }] : [])] };
  });

const chatInput = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
});

export const guardianChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof chatInput>) => chatInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);

    const scan: GuardianScanResult = await buildGuardianScan(ctx.supabase, companyId);
    const { generateText } = await import("ai");
    const { buildGuardianModel } = await import("@/lib/ai-provider.server");
    const { model, label, usingFallback } = await buildGuardianModel(ctx.supabase, companyId);
    const messages = data.messages.slice(-18).filter((m) => m.content.trim()).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 6000),
    }));

    const system = `Você é o Guardião do Zenda, um agente operacional sênior.
Responda em português, com tom direto e premium. Você analisa o sistema, identifica bugs operacionais, explica causa/impacto e aponta a ação correta do painel.

Regras:
- Baseie-se apenas no snapshot real abaixo.
- Não invente IDs, tabelas ou correções que não aparecem no snapshot.
- Se houver ação possível, cite exatamente: Reenviar, Reprocessar, Ativar/Desativar, Ver detalhes ou Executar SELECT.
- Para erro de código, entregue "Patch sugerido" com arquivo provável e abordagem, mas diga que precisa ser aplicado no Lovable.
- Seja objetivo, com diagnóstico, causa provável, impacto e próxima ação.

Snapshot do sistema:
${JSON.stringify({
  status: scan.status,
  score: scan.score,
  health: scan.health,
  incidents: scan.incidents.slice(0, 12),
  recommendations: scan.recommendations,
})}`;

    const { text } = await generateText({ model, system, messages });

    await ctx.supabase.from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: "chat",
      status: "ok",
      payload: { messages, provider: label },
      result: { text, provider: label, usingFallback },
    });

    return { text, provider: label, usingFallback };
  });

/* ===========================================================
 * Incident reporting + AI diagnosis (Guardião autônomo)
 * =========================================================== */

const reportInput = z.object({
  kind: z.enum(["runtime", "promise", "network", "boundary"]).default("runtime"),
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).optional(),
  route: z.string().max(500).optional(),
  fingerprint: z.string().max(64).optional(),
  context: z.record(z.string(), z.any()).optional(),
});

function sanitizeContext(ctx: Record<string, unknown> | undefined) {
  if (!ctx) return {} as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const banned = /(token|secret|password|authorization|apikey|api[-_]?key|bearer|cookie|session)/i;
  for (const [k, v] of Object.entries(ctx)) {
    if (banned.test(k)) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (s && s.length < 4000) out[k] = v;
    else if (s) out[k] = s.slice(0, 4000);
  }
  return out;
}

function severityFromMessage(msg: string): "low" | "medium" | "high" | "critical" {
  const m = msg.toLowerCase();
  if (/(cannot read|undefined is not|is not a function|null is not|maximum call stack)/.test(m)) return "high";
  if (/(rls|permission|forbidden|unauthorized|401|403|500)/.test(m)) return "high";
  if (/(network|failed to fetch|timeout|abort)/.test(m)) return "medium";
  return "medium";
}

export const reportGuardianIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof reportInput>) => reportInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    const companyId = await getCurrentCompanyId(ctx);
    const cleanCtx = sanitizeContext(data.context);
    const severity = severityFromMessage(data.message);

    if (data.fingerprint) {
      const { data: existing } = await ctx.supabase
        .from("guardian_incidents")
        .select("id, occurrences")
        .eq("company_id", companyId)
        .eq("fingerprint", data.fingerprint)
        .in("status", ["open", "analyzing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        await ctx.supabase
          .from("guardian_incidents")
          .update({
            occurrences: Number(existing.occurrences ?? 1) + 1,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        return { incidentId: existing.id as string, deduped: true };
      }
    }

    const { data: inserted, error } = await ctx.supabase
      .from("guardian_incidents")
      .insert({
        company_id: companyId,
        user_id: ctx.userId,
        kind: data.kind,
        severity,
        status: "open",
        fingerprint: data.fingerprint ?? null,
        message: data.message,
        stack: data.stack ?? null,
        route: data.route ?? null,
        context: cleanCtx,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    // OBS-H-01: alerta externo best-effort. Usa supabaseAdmin apenas para
    // gravar a auditoria em guardian_runs (o alerter em si só faz HTTP POST
    // ao webhook configurado por env).
    try {
      const { sendGuardianAlert } = await import("@/lib/observability/guardian-alerter.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await sendGuardianAlert(
        {
          incidentId: (inserted?.id as string) ?? "",
          companyId,
          kind: data.kind,
          severity,
          message: data.message,
          route: data.route ?? null,
          fingerprint: data.fingerprint ?? null,
          source: "reporter",
        },
        supabaseAdmin as any,
      );
    } catch {
      // silencioso — alerter nunca deve quebrar o reporter
    }
    return { incidentId: inserted?.id as string, deduped: false };
  });

export const guardianListIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { status?: string } | undefined) =>
    z.object({ status: z.enum(["open", "analyzing", "resolved", "ignored", "all"]).default("open") }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    let q = ctx.supabase
      .from("guardian_incidents")
      .select("id, kind, severity, status, message, route, occurrences, requires_code_change, fix_summary, diagnosis, last_seen_at, created_at, resolved_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { incidents: safeRows<any>(rows ?? []) };
  });

export const guardianGetIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const { data: row, error } = await ctx.supabase
      .from("guardian_incidents")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Incidente não encontrado.");
    return { incident: safeRows<any>([row])[0] };
  });

export const guardianAnalyzeIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);

    const { data: incident, error: readErr } = await ctx.supabase
      .from("guardian_incidents")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!incident) throw new Error("Incidente não encontrado.");

    await ctx.supabase.from("guardian_incidents").update({ status: "analyzing" }).eq("id", data.id);

    const scan = await buildGuardianScan(ctx.supabase, companyId);
    const { generateText } = await import("ai");
    const { buildGuardianModel } = await import("@/lib/ai-provider.server");
    const { model, label: providerLabel, usingFallback } = await buildGuardianModel(ctx.supabase, companyId);

    const system = `Você é o Guardião: engenheiro de software sênior responsável pela plataforma Zenda (TanStack Start + Supabase + WhatsApp providers).
Analise o incidente abaixo, encontre a CAUSA RAIZ (não o sintoma) e responda em português, markdown, com esta estrutura EXATA:

## Diagnóstico
(1-2 frases)

## Causa raiz
(explicação técnica clara)

## Impacto
(o que o usuário deixa de conseguir fazer)

## Ação recomendada
- Se dá para reparar no runtime (mensagem/fluxo/canal/integração), diga qual ação do painel usar: Reenviar, Reprocessar, Ativar/Desativar integração, Reconectar canal.
- Se exige mudança de código, escreva "Requer alteração de código" e liste arquivos/áreas suspeitas e a correção a aplicar.

## Prevenção
(1-2 dicas para não repetir)

Ao final, adicione a linha:
REQUIRES_CODE_CHANGE: true|false`;

    const safeContext = sanitizeContext((incident.context ?? {}) as Record<string, unknown>);

    const prompt = `INCIDENTE
- Tipo: ${incident.kind}
- Severidade: ${incident.severity}
- Rota: ${incident.route ?? "n/d"}
- Ocorrências: ${incident.occurrences}
- Mensagem: ${incident.message}
- Stack (topo):
${(incident.stack ?? "").slice(0, 2500)}

CONTEXTO (sanitizado):
${JSON.stringify(safeContext, null, 2).slice(0, 2500)}

SAÚDE DO SISTEMA:
${JSON.stringify(scan.health)}

INCIDENTES OPERACIONAIS ATIVOS: ${scan.incidents.length} (crítico=${scan.incidents.filter((i) => i.severity === "critical").length})`;

    let text = "";
    let requiresCode = false;
    let aiError: string | null = null;
    try {
      const res = await generateText({ model, system, prompt });
      text = res.text ?? "";
      requiresCode = /REQUIRES_CODE_CHANGE:\s*true/i.test(text);
      text = text.replace(/REQUIRES_CODE_CHANGE:\s*(true|false)\s*$/i, "").trim();
    } catch (err) {
      aiError = (err as Error).message;
      text = `Não foi possível concluir a análise automática (${providerLabel}): ${aiError}. Verifique o stack e o contexto acima.`;
      requiresCode = true;
    }

    const diagnosis = {
      analyzedAt: new Date().toISOString(),
      markdown: text,
      provider: providerLabel,
      usingFallback,
      snapshot: { health: scan.health, incidents: scan.incidents.length },
    };

    await ctx.supabase
      .from("guardian_incidents")
      .update({
        diagnosis,
        requires_code_change: requiresCode,
        fix_summary: text.split("\n").slice(0, 3).join(" ").slice(0, 500),
      })
      .eq("id", data.id);

    await ctx.supabase.from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: "analyzeIncident",
      status: aiError ? "warning" : "ok",
      error: aiError,
      incident_id: data.id,
      payload: { incidentId: data.id, provider: providerLabel },
      result: { requiresCode, provider: providerLabel, usingFallback },
    });

    return { diagnosis, requiresCode, provider: providerLabel, usingFallback };
  });

/** Which AI provider will the Guardian use right now? */
export const guardianActiveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const { resolveActiveAIProvider } = await import("@/lib/ai-provider.server");
    try {
      const r = await resolveActiveAIProvider(ctx.supabase, companyId);
      return {
        provider: r.provider,
        model: r.model,
        source: r.source,
        label:
          r.provider === "openai"
            ? `OpenAI · ${r.model}`
            : r.provider === "anthropic"
              ? `Anthropic · ${r.model}`
              : r.provider === "google_gemini"
                ? `Google Gemini · ${r.model}`
                : `Lovable AI · ${r.model} (fallback)`,
      };
    } catch (err) {
      return { provider: "none" as const, model: null, source: "none" as const, label: (err as Error).message };
    }
  });

/** Re-runs a targeted scan and marks the incident resolved only when the specific area is healthy. */
export const guardianValidateFix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);

    const { data: incident, error: readErr } = await ctx.supabase
      .from("guardian_incidents")
      .select("id, kind, route, status, fingerprint")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!incident) throw new Error("Incidente não encontrado.");

    const scan = await buildGuardianScan(ctx.supabase, companyId);
    const frontendKinds = new Set(["runtime", "promise", "boundary", "network"]);
    let validated = false;
    let reason = "";

    if (frontendKinds.has(incident.kind) && incident.fingerprint) {
      // Per-incident validation: same fingerprint must not have recurred in the last 5 minutes.
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recent } = await ctx.supabase
        .from("guardian_incidents")
        .select("id, last_seen_at")
        .eq("company_id", companyId)
        .eq("fingerprint", incident.fingerprint)
        .neq("id", data.id)
        .gt("last_seen_at", cutoff)
        .limit(1);
      const stillHappening = (recent ?? []).length > 0;
      validated = !stillHappening;
      reason = validated
        ? "Nenhuma recorrência detectada nos últimos 5 minutos."
        : "O mesmo erro voltou a acontecer nos últimos 5 minutos — correção não foi efetiva.";
    } else {
      // Operational incident: re-check that no critical incident remains in the same kind.
      const stillCritical = scan.incidents.some(
        (i) => i.severity === "critical" && (incident.kind ? String(i.kind) === String(incident.kind) : true),
      );
      validated = !stillCritical;
      reason = validated
        ? `Área ${incident.kind} está saudável (score ${scan.score}).`
        : `Ainda há incidentes críticos na área ${incident.kind}.`;
    }

    const patch = validated
      ? {
          status: "resolved",
          resolved_at: new Date().toISOString(),
          fix_summary: `Validado pelo Guardião: ${reason}`,
        }
      : {
          status: "open",
          fix_summary: reason,
        };

    await ctx.supabase.from("guardian_incidents").update(patch).eq("id", data.id);

    await ctx.supabase.from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: "validateFix",
      status: validated ? "ok" : "warning",
      incident_id: data.id,
      payload: { incidentId: data.id, kind: incident.kind },
      result: { validated, reason, score: scan.score, openIncidents: scan.incidents.length },
    });

    return { validated, reason, score: scan.score, openIncidents: scan.incidents.length };
  });

/** Health probe for the currently active AI provider (used by the "Test provider" button). */
export const guardianTestProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const started = Date.now();
    try {
      const { generateText } = await import("ai");
      const { buildGuardianModel } = await import("@/lib/ai-provider.server");
      const { model, label, usingFallback, providerId } = await buildGuardianModel(ctx.supabase, companyId);
      const { text } = await generateText({
        model,
        prompt: "Responda apenas com a palavra: OK",
      });
      const latencyMs = Date.now() - started;
      await ctx.supabase.from("guardian_runs").insert({
        company_id: companyId,
        user_id: ctx.userId,
        action: "testProvider",
        status: "ok",
        payload: { provider: label },
        result: { ok: true, latencyMs, provider: label, sample: text.slice(0, 60) },
      });
      return { ok: true, latencyMs, provider: label, providerId, usingFallback, sample: text.slice(0, 60) };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = (err as Error).message;
      await ctx.supabase.from("guardian_runs").insert({
        company_id: companyId,
        user_id: ctx.userId,
        action: "testProvider",
        status: "failed",
        error: message,
        result: { ok: false, latencyMs },
      });
      return { ok: false, latencyMs, error: message };
    }
  });

export const guardianResolveIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; note?: string }) =>
    z.object({ id: z.string().uuid(), note: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const { error } = await ctx.supabase
      .from("guardian_incidents")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        fix_summary: data.note ?? "Marcado como resolvido pelo administrador.",
      })
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const guardianIgnoreIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason?: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const { error } = await ctx.supabase
      .from("guardian_incidents")
      .update({
        status: "ignored",
        resolved_at: new Date().toISOString(),
        fix_summary: data.reason ?? "Ignorado pelo administrador.",
      })
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Applies a safe operational fix based on context.repairAction stored on the
 * incident (populated by cron/manual scans), then re-runs guardianValidateFix
 * so the row is closed only when the fix stuck.
 */
export const guardianAutoFix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);

    const { data: incident, error: readErr } = await ctx.supabase
      .from("guardian_incidents")
      .select("id, kind, context")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!incident) throw new Error("Incidente não encontrado.");

    const ictx = (incident.context ?? {}) as Record<string, any>;
    const action: string | undefined = ictx.repairAction;
    const entityId: string | undefined = ictx.entityId;
    const payload = (ictx.payload ?? {}) as Record<string, any>;

    let applied = false;
    let detail = "";

    if (action === "toggle_integration" && entityId) {
      const enable = payload.enabled !== true;
      const { error } = await ctx.supabase
        .from("integrations")
        .update({ enabled: enable })
        .eq("id", entityId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      applied = true;
      detail = `Integração ${enable ? "reativada" : "desativada"}.`;
    } else if (action === "retry_flow" && entityId) {
      const { error } = await ctx.supabase
        .from("flow_runs")
        .update({
          status: "queued",
          error: null,
          completed_at: null,
          cursor_node_id: null,
          started_at: new Date().toISOString(),
        })
        .eq("id", entityId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      applied = true;
      detail = "Execução do fluxo recolocada na fila.";
    } else if (action === "resend_message" && entityId) {
      // Delegates to the existing manual resend path — keeps provider dispatch in one place.
      throw new Error("Use o botão Reenviar na linha do incidente para acionar o envio ao provedor.");
    } else {
      throw new Error("Este incidente não tem uma correção automática segura. Analise manualmente.");
    }

    await ctx.supabase.from("guardian_runs").insert({
      company_id: companyId,
      user_id: ctx.userId,
      action: "autoFix",
      status: applied ? "ok" : "warning",
      incident_id: data.id,
      payload: { action, entityId },
      result: { applied, detail },
    });

    // Chain into validation so the row closes only if the area recovered.
    let validation: { validated: boolean; reason: string } = { validated: false, reason: "Aguardando revalidação." };
    try {
      const scan = await buildGuardianScan(ctx.supabase, companyId);
      const stillCritical = scan.incidents.some(
        (i) => i.severity === "critical" && String(i.id) === String(entityId),
      );
      validation = {
        validated: !stillCritical,
        reason: stillCritical ? "A mesma entidade ainda aparece como crítica após o reparo." : `${detail} Área saudável (score ${scan.score}).`,
      };
      const patch = validation.validated
        ? {
            status: "resolved" as const,
            resolved_at: new Date().toISOString(),
            fix_summary: `Auto-fix: ${validation.reason}`,
          }
        : { status: "open" as const, fix_summary: validation.reason };
      await ctx.supabase.from("guardian_incidents").update(patch).eq("id", data.id);
    } catch (err) {
      validation = { validated: false, reason: `Revalidação falhou: ${(err as Error).message}` };
    }

    return { applied, action, detail, validation };
  });

/** Últimos snapshots de saúde (para sparkline do painel). */
export const guardianListSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { limit?: number } | undefined) =>
    z.object({ limit: z.number().int().min(1).max(200).default(48) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    await requireGuardianAdmin(ctx);
    const companyId = await getCurrentCompanyId(ctx);
    const { data: rows, error } = await ctx.supabase
      .from("guardian_health_snapshots")
      .select("id, status, score, incident_count, critical_count, source, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { snapshots: (rows ?? []).reverse() };
  });

