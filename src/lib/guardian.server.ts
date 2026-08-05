import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardianIncident, GuardianScanResult, GuardianSeverity, JsonValue } from "@/lib/guardian.types";
import { requireAdmin } from "@/lib/rbac/guard";

type Db = SupabaseClient<any, "public", any>;

export async function requireGuardianAdmin(context: { supabase: Db; userId: string }) {
  await requireAdmin(context, "Apenas administradores podem usar o Guardião.");
}

export async function getCurrentCompanyId(context: { supabase: Db; userId: string }) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("company_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.company_id) throw new Error("Empresa não encontrada.");
  return data.company_id as string;
}

export const safeRows = <T,>(rows: unknown): T[] =>
  JSON.parse(JSON.stringify(rows ?? [])) as T[];

function asDate(value: unknown) {
  return typeof value === "string" ? value : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function jsonObject(value: unknown): { [key: string]: JsonValue } {
  return JSON.parse(JSON.stringify(value ?? {})) as { [key: string]: JsonValue };
}

function severityWeight(severity: GuardianSeverity) {
  return severity === "critical" ? 24 : severity === "warning" ? 10 : 0;
}

export async function buildGuardianScan(supabase: Db, companyId: string): Promise<GuardianScanResult> {
  const now = new Date();
  const generatedAt = now.toISOString();
  const since1h = new Date(now.getTime() - 3600_000).toISOString();
  const since24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();

  const [
    failedMessages,
    failedFlows,
    integrations,
    channels,
    events24h,
    msgs1h,
    failed24h,
    broadcasts,
    cascadeRuns,
    cascadeAttempts,
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("id, created_at, direction, type, status, error, failed_at, retry_count, conversation_id, body, media_url, media_metadata")
      .eq("company_id", companyId)
      .eq("status", "failed")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("flow_runs")
      .select("id, status, error, created_at, flow_id, conversation_id, channel_id, messages_sent, is_test")
      .eq("company_id", companyId)
      .eq("status", "failed")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("integrations")
      .select("id, provider, label, enabled, test_status, test_error, last_tested_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("channels")
      .select("id, name, phone_number, status, provider, provider_type, last_connected_at, paused_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("channel_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", since24h),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", since1h),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "failed")
      .gte("created_at", since24h),
    supabase
      .from("broadcasts")
      .select("id, name, status, failed_count, total_recipients, created_at, completed_at")
      .eq("company_id", companyId)
      .gt("failed_count", 0)
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("cascade_runs")
      .select("id, status, last_error, current_step, conversation_id, created_at")
      .eq("company_id", companyId)
      .in("status", ["failed", "exhausted"])
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("cascade_attempts")
      .select("id, status, error, run_id, step_index, channel_type, created_at")
      .eq("company_id", companyId)
      .eq("status", "failed")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const error = [
    failedMessages.error,
    failedFlows.error,
    integrations.error,
    channels.error,
    events24h.error,
    msgs1h.error,
    failed24h.error,
    broadcasts.error,
    cascadeRuns.error,
    cascadeAttempts.error,
  ].find(Boolean);
  if (error) throw new Error(error.message);

  const messageRows = safeRows<Record<string, unknown>>(failedMessages.data);
  const flowRows = safeRows<Record<string, unknown>>(failedFlows.data);
  const integrationRows = safeRows<Record<string, unknown>>(integrations.data);
  const channelRows = safeRows<Record<string, unknown>>(channels.data);
  const broadcastRows = safeRows<Record<string, unknown>>(broadcasts.data);
  const cascadeRunRows = safeRows<Record<string, unknown>>(cascadeRuns.data);
  const cascadeAttemptRows = safeRows<Record<string, unknown>>(cascadeAttempts.data);

  const incidents: GuardianIncident[] = [];

  for (const m of messageRows) {
    const retryCount = Number(m.retry_count ?? 0);
    incidents.push({
      id: String(m.id),
      kind: "message",
      title: `${m.direction === "outbound" ? "Envio" : "Recebimento"} de ${String(m.type ?? "mensagem")} falhou`,
      severity: retryCount >= 2 ? "critical" : "warning",
      status: String(m.status ?? "failed"),
      detectedAt: asDate(m.failed_at) ?? asDate(m.created_at),
      impact: "Contato pode ficar sem resposta ou com atendimento interrompido.",
      probableCause: text(m.error, text((m.media_metadata as { send_error?: string } | null)?.send_error, "Falha do provedor ou configuração do canal.")),
      recommendedAction: "Use Reenviar para colocar a mensagem novamente na fila e acompanhe o canal relacionado.",
      repairAction: "resend_message",
      payload: jsonObject(m),
    });
  }

  for (const r of flowRows) {
    incidents.push({
      id: String(r.id),
      kind: "flow",
      title: `Fluxo ${String(r.flow_id ?? "").slice(0, 8)} travou`,
      severity: "critical",
      status: String(r.status ?? "failed"),
      detectedAt: asDate(r.created_at),
      impact: "Automação pode ter parado antes de entregar mensagens ou regras importantes.",
      probableCause: text(r.error, "Erro em nó, condição, mídia ou integração do fluxo."),
      recommendedAction: "Abra detalhes para ver o erro e use Reprocessar quando houver contexto de conversa.",
      repairAction: "retry_flow",
      payload: jsonObject(r),
    });
  }

  for (const i of integrationRows.filter((row) => row.test_status === "error" || row.enabled === false)) {
    incidents.push({
      id: String(i.id),
      kind: "integration",
      title: `${text(i.label, text(i.provider, "Integração"))} requer atenção`,
      severity: i.test_status === "error" ? "critical" : "warning",
      status: i.enabled === false ? "disabled" : String(i.test_status ?? "unknown"),
      detectedAt: asDate(i.last_tested_at),
      impact: "Recursos conectados a esta integração podem falhar ou ficar indisponíveis.",
      probableCause: text(i.test_error, i.enabled === false ? "Integração desativada." : "Último teste retornou erro."),
      recommendedAction: i.enabled === false ? "Ative a integração se ela deve participar da operação." : "Revise credenciais e execute novo teste da integração.",
      repairAction: "toggle_integration",
      payload: jsonObject(i),
    });
  }

  for (const c of channelRows.filter((row) => !["connected", "active", "online"].includes(String(row.status)))) {
    incidents.push({
      id: String(c.id),
      kind: "channel",
      title: `${text(c.name, "Canal")} está ${String(c.status ?? "indisponível")}`,
      severity: String(c.status) === "paused" ? "warning" : "critical",
      status: String(c.status ?? "unknown"),
      detectedAt: asDate(c.last_connected_at) ?? asDate(c.paused_at),
      impact: "Mensagens de entrada/saída podem não trafegar por este número.",
      probableCause: "Sessão desconectada, pausada ou aguardando reconexão do provedor.",
      recommendedAction: "Abra Canais, reconecte o número ou revise a sessão do provedor.",
      repairAction: "inspect",
      payload: jsonObject(c),
    });
  }

  for (const b of broadcastRows) {
    incidents.push({
      id: String(b.id),
      kind: "broadcast",
      title: `Campanha com ${Number(b.failed_count ?? 0)} falhas`,
      severity: Number(b.failed_count ?? 0) > 10 ? "critical" : "warning",
      status: String(b.status ?? "unknown"),
      detectedAt: asDate(b.completed_at) ?? asDate(b.created_at),
      impact: "Parte da audiência pode não ter recebido a comunicação.",
      probableCause: "Falha de entrega por canal, número inválido, limite externo ou mídia inválida.",
      recommendedAction: "Revise destinatários falhados e o canal usado na campanha.",
      repairAction: "inspect",
      payload: jsonObject(b),
    });
  }

  for (const c of cascadeRunRows) {
    incidents.push({
      id: String(c.id),
      kind: "cascade",
      title: `Cascata ${String(c.status ?? "falhou")}`,
      severity: "warning",
      status: String(c.status ?? "unknown"),
      detectedAt: asDate(c.created_at),
      impact: "A política de fallback pode ter esgotado antes de concluir o contato.",
      probableCause: text(c.last_error, "Etapas consecutivas falharam ou nenhuma rota disponível respondeu."),
      recommendedAction: "Revise as tentativas e canais da cascata antes de reativar a política.",
      repairAction: "inspect",
      payload: jsonObject(c),
    });
  }

  for (const a of cascadeAttemptRows) {
    incidents.push({
      id: String(a.id),
      kind: "cascade",
      title: `Tentativa de cascata falhou no passo ${String(a.step_index ?? "?")}`,
      severity: "warning",
      status: String(a.status ?? "failed"),
      detectedAt: asDate(a.created_at),
      impact: "Um caminho de fallback específico não entregou a mensagem.",
      probableCause: text(a.error, "Falha no provedor do canal da etapa."),
      recommendedAction: "Compare o erro com o status do canal usado nesta etapa.",
      repairAction: "inspect",
      payload: jsonObject(a),
    });
  }

  incidents.sort((a, b) => {
    const sev = severityWeight(b.severity) - severityWeight(a.severity);
    if (sev !== 0) return sev;
    return new Date(b.detectedAt ?? 0).getTime() - new Date(a.detectedAt ?? 0).getTime();
  });

  const integrationsError = integrationRows.filter((i) => i.test_status === "error").length;
  const integrationsOn = integrationRows.filter((i) => i.enabled === true).length;
  const channelsOnline = channelRows.filter((c) => ["connected", "active", "online"].includes(String(c.status))).length;
  const flowFailures24h = flowRows.filter((r) => new Date(String(r.created_at)).getTime() >= new Date(since24h).getTime()).length;

  const critical = incidents.filter((i) => i.severity === "critical").length;
  const warning = incidents.filter((i) => i.severity === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - critical * 18 - warning * 7));
  const status: GuardianSeverity = critical > 0 ? "critical" : warning > 0 ? "warning" : "healthy";

  const recommendations = [
    ...(critical > 0
      ? [{ title: "Priorize incidentes críticos", body: "Corrija primeiro mensagens e fluxos falhados, pois impactam atendimento em tempo real.", severity: "critical" as const }]
      : []),
    ...(integrationsError > 0
      ? [{ title: "Revalidar integrações", body: "Há integrações com último teste em erro. Revise credenciais antes de reenfileirar operações em massa.", severity: "warning" as const }]
      : []),
    ...(channelRows.length > 0 && channelsOnline === 0
      ? [{ title: "Reconectar canais", body: "Nenhum canal aparece online. Sem canal ativo, envios automáticos continuarão falhando.", severity: "critical" as const }]
      : []),
    ...(incidents.length === 0
      ? [{ title: "Operação estável", body: "Nenhum incidente relevante foi detectado na janela analisada.", severity: "healthy" as const }]
      : []),
  ];

  return {
    companyId,
    status,
    score,
    summary:
      status === "healthy"
        ? "Nenhum bloqueio operacional foi detectado. O sistema está pronto para operar."
        : status === "critical"
          ? `Detectei ${critical} incidente(s) crítico(s) e ${warning} alerta(s). A correção deve começar pelos itens no topo da lista.`
          : `Detectei ${warning} alerta(s). O sistema opera, mas há pontos que merecem correção preventiva.`,
    generatedAt,
    health: {
      messagesLastHour: Number(msgs1h.count ?? 0),
      failuresLast24h: Number(failed24h.count ?? 0),
      integrationsOn,
      integrationsTotal: integrationRows.length,
      integrationsError,
      webhooksLast24h: Number(events24h.count ?? 0),
      channelsOnline,
      channelsTotal: channelRows.length,
      flowFailures24h,
    },
    incidents,
    recommendations,
  };
}

export function assertReadOnlySql(sql: string) {
  const cleaned = sql.trim().replace(/;+\s*$/, "");
  const lower = cleaned.toLowerCase();
  if (!lower.startsWith("select") && !lower.startsWith("with")) {
    throw new Error("Somente SELECT/WITH permitidos.");
  }
  const banned = ["insert ", "update ", "delete ", "drop ", "alter ", "truncate ", "grant ", "revoke ", "create ", " call ", " do ", "security"];
  for (const term of banned) {
    if (lower.includes(term)) throw new Error(`Palavra proibida em leitura: ${term.trim()}.`);
  }
  if (cleaned.includes(";")) throw new Error("Múltiplas queries não são permitidas.");
  return cleaned;
}