import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Plug,
  Radar,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Webhook,
  Workflow,
  WifiOff,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClientTime } from "@/components/client-time";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { supabase } from "@/integrations/supabase/client";
import {
  guardianOverview,
  guardianResendMessage,
  guardianRetryFlowRun,
  guardianScan,
  guardianToggleIntegration,
} from "@/lib/guardian.functions";
import type {
  GuardianIncident,
  GuardianScanResult,
  GuardianSeverity,
} from "@/lib/guardian.types";
import { MobileIncidentSheet } from "./mobile-incident-sheet";

type Filter = "all" | GuardianIncident["kind"];

const CHIPS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "message", label: "Mensagens" },
  { id: "flow", label: "Fluxos" },
  { id: "channel", label: "Canais" },
  { id: "integration", label: "Integrações" },
  { id: "broadcast", label: "Campanhas" },
  { id: "cascade", label: "Cascatas" },
];

/**
 * Mobile-native Guardian home — score hero, KPI strip, filter chips,
 * incident cards, bottom-sheet detail. Reuses guardian server functions,
 * types and realtime subscription — no business logic changes.
 */
export function MobileGuardianHome({
  initialIncidentId,
}: {
  initialIncidentId?: string;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [detailId, setDetailId] = useState<string | null>(
    initialIncidentId ?? null,
  );
  const [online, setOnline] = useState(true);

  const overview = useQuery({
    queryKey: ["guardian-overview"],
    queryFn: () => guardianOverview({ data: { windowHours: 168 } }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const scan = useMutation({
    mutationFn: () => guardianScan(),
    onSuccess: () => {
      toast.success("Análise concluída");
      qc.invalidateQueries({ queryKey: ["guardian-overview"] });
    },
    onError: (e) => toast.error(readError(e)),
  });

  const resend = useMutation({
    mutationFn: (id: string) =>
      guardianResendMessage({ data: { messageId: id } }),
    onSuccess: () => {
      toast.success("Mensagem reenviada");
      qc.invalidateQueries({ queryKey: ["guardian-overview"] });
    },
    onError: (e) => toast.error(readError(e)),
  });

  const retryFlow = useMutation({
    mutationFn: (id: string) => guardianRetryFlowRun({ data: { runId: id } }),
    onSuccess: () => {
      toast.success("Fluxo recolocado");
      qc.invalidateQueries({ queryKey: ["guardian-overview"] });
    },
    onError: (e) => toast.error(readError(e)),
  });

  const toggleIntegration = useMutation({
    mutationFn: (payload: { id: string; enabled: boolean }) =>
      guardianToggleIntegration({ data: payload }),
    onSuccess: () => {
      toast.success("Integração atualizada");
      qc.invalidateQueries({ queryKey: ["guardian-overview"] });
    },
    onError: (e) => toast.error(readError(e)),
  });

  // FAB — "Analisar agora"
  const { setAction } = useMobileFab();
  useEffect(() => {
    setAction({
      label: "Analisar agora",
      icon: Sparkles,
      onClick: () => scan.mutate(),
    });
    return () => setAction(null);
  }, [setAction, scan]);

  // Offline listener
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Realtime: incidents change → refresh
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user || cancelled) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userRes.user.id)
        .maybeSingle();
      const cid = prof?.company_id;
      if (!cid || cancelled) return;
      channel = supabase
        .channel(`mobile-guardian-incidents-${cid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "guardian_incidents",
            filter: `company_id=eq.${cid}`,
          },
          () =>
            qc.invalidateQueries({ queryKey: ["guardian-overview"] }),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  const data = overview.data as GuardianScanResult | undefined;
  const incidents = useMemo(() => {
    const list = data?.incidents ?? [];
    return filter === "all"
      ? list
      : list.filter((i) => i.kind === filter);
  }, [data?.incidents, filter]);

  const detailIncident = useMemo(
    () => data?.incidents.find((i) => i.id === detailId) ?? null,
    [data?.incidents, detailId],
  );

  const isUpdating =
    scan.isPending ||
    resend.isPending ||
    retryFlow.isPending ||
    toggleIntegration.isPending ||
    overview.isFetching;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-background/90 px-4 pt-3 pb-2 backdrop-blur">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight">
              Guardião
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {data
                ? `${data.incidents.length} incidentes · ${data.health.channelsOnline}/${data.health.channelsTotal} canais online`
                : "Analisando sua operação…"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => overview.refetch()}
            disabled={isUpdating}
            aria-label="Atualizar radar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isUpdating ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {/* Filter chips */}
        <div className="-mx-4 mt-3 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-1.5 pb-1">
            {CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  filter === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!online && (
        <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>Você está offline. Reconectando quando voltar…</span>
        </div>
      )}

      {/* Scroll area */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {overview.isLoading ? (
          <LoadingState />
        ) : overview.error ? (
          <ErrorState
            message={readError(overview.error)}
            onRetry={() => overview.refetch()}
          />
        ) : !data ? (
          <EmptyPermission />
        ) : (
          <>
            <HealthHero
              data={data}
              onScan={() => scan.mutate()}
              loading={scan.isPending}
            />

            <div className="mt-3 grid grid-cols-4 gap-2">
              <MiniKpi
                icon={<Activity className="h-3.5 w-3.5" />}
                label="Msgs/h"
                value={data.health.messagesLastHour}
                tone="primary"
              />
              <MiniKpi
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="Falhas 24h"
                value={data.health.failuresLast24h}
                tone={data.health.failuresLast24h > 0 ? "danger" : "success"}
              />
              <MiniKpi
                icon={<Plug className="h-3.5 w-3.5" />}
                label="Integr."
                value={`${data.health.integrationsOn}/${data.health.integrationsTotal}`}
                tone={
                  data.health.integrationsError > 0 ? "warning" : "success"
                }
              />
              <MiniKpi
                icon={<Webhook className="h-3.5 w-3.5" />}
                label="Canais"
                value={`${data.health.channelsOnline}/${data.health.channelsTotal}`}
                tone={
                  data.health.channelsTotal > 0 &&
                  data.health.channelsOnline === 0
                    ? "danger"
                    : "success"
                }
              />
            </div>

            <div className="mt-5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Incidentes</h2>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {incidents.length}
              </span>
            </div>

            {incidents.length === 0 ? (
              <EmptyIncidents hasFilter={filter !== "all"} />
            ) : (
              <ul className="mt-2 space-y-2">
                {incidents.map((incident) => (
                  <li key={`${incident.kind}-${incident.id}`}>
                    <IncidentCard
                      incident={incident}
                      onOpen={() => setDetailId(incident.id)}
                      onQuickRepair={() => {
                        if (incident.repairAction === "resend_message")
                          resend.mutate(incident.id);
                        else if (incident.repairAction === "retry_flow")
                          retryFlow.mutate(incident.id);
                        else if (
                          incident.repairAction === "toggle_integration"
                        ) {
                          const enabled =
                            incident.payload.enabled !== true;
                          toggleIntegration.mutate({
                            id: incident.id,
                            enabled,
                          });
                        } else {
                          setDetailId(incident.id);
                        }
                      }}
                      repairing={
                        resend.isPending ||
                        retryFlow.isPending ||
                        toggleIntegration.isPending
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <MobileIncidentSheet
        incident={detailIncident}
        open={!!detailId}
        onOpenChange={(v) => !v && setDetailId(null)}
        onRepair={(inc) => {
          if (inc.repairAction === "resend_message") resend.mutate(inc.id);
          else if (inc.repairAction === "retry_flow")
            retryFlow.mutate(inc.id);
          else if (inc.repairAction === "toggle_integration") {
            const enabled = inc.payload.enabled !== true;
            toggleIntegration.mutate({ id: inc.id, enabled });
          }
        }}
        repairing={
          resend.isPending ||
          retryFlow.isPending ||
          toggleIntegration.isPending
        }
      />
    </div>
  );
}

/* ---------- sub-components ---------- */

function HealthHero({
  data,
  onScan,
  loading,
}: {
  data: GuardianScanResult;
  onScan: () => void;
  loading: boolean;
}) {
  const score = Math.max(0, Math.min(100, Math.round(data.score ?? 0)));
  const tone = data.status;
  const toneColor =
    tone === "healthy"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-rose-500";
  const toneBg =
    tone === "healthy"
      ? "from-emerald-500/15"
      : tone === "warning"
        ? "from-amber-500/15"
        : "from-rose-500/15";
  const label =
    tone === "healthy"
      ? "Saudável"
      : tone === "warning"
        ? "Atenção"
        : "Crítico";
  const Icon =
    tone === "healthy"
      ? ShieldCheck
      : tone === "warning"
        ? ShieldAlert
        : AlertTriangle;

  const circumference = 2 * Math.PI * 40;
  const dash = (score / 100) * circumference;

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${toneBg} via-card to-card p-4 shadow-sm`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="40"
              className="stroke-muted"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              className={toneColor}
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${circumference}`}
              style={{ transition: "stroke-dasharray 600ms ease" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <p className="font-display text-2xl font-black leading-none tabular-nums">
                {score}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Score
              </p>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div
            className={`inline-flex items-center gap-1.5 rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-semibold ${toneColor}`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </div>
          <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">
            {data.summary ??
              "Guardião analisando mensagens, fluxos, canais e integrações."}
          </p>
          {data.generatedAt && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Atualizado <ClientTime iso={data.generatedAt} />
            </p>
          )}
        </div>
      </div>

      <Button
        onClick={onScan}
        disabled={loading}
        className="mt-3 h-10 w-full rounded-xl"
      >
        {loading ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Analisando…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Analisar agora
          </>
        )}
      </Button>
    </section>
  );
}

const KIND_META: Record<
  GuardianIncident["kind"],
  { label: string; icon: typeof MessageSquare }
> = {
  message: { label: "Mensagem", icon: MessageSquare },
  flow: { label: "Fluxo", icon: Workflow },
  channel: { label: "Canal", icon: Webhook },
  integration: { label: "Integração", icon: Plug },
  broadcast: { label: "Campanha", icon: Send },
  cascade: { label: "Cascata", icon: Zap },
};

function IncidentCard({
  incident,
  onOpen,
  onQuickRepair,
  repairing,
}: {
  incident: GuardianIncident;
  onOpen: () => void;
  onQuickRepair: () => void;
  repairing: boolean;
}) {
  const meta = KIND_META[incident.kind];
  const Icon = meta.icon;
  const canRepair =
    incident.repairAction === "resend_message" ||
    incident.repairAction === "retry_flow" ||
    incident.repairAction === "toggle_integration";

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm active:bg-muted/30">
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 text-left focus:outline-none"
      >
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${severityIconBg(incident.severity)}`}
        >
          <Icon className={`h-4 w-4 ${severityIconColor(incident.severity)}`} />
        </div>
        <div className="min-w-0">
          <p className="line-clamp-2 text-[14px] font-semibold leading-snug">
            {incident.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <SeverityChip severity={incident.severity} />
            <span className="truncate">· {meta.label}</span>
            {incident.detectedAt && (
              <span className="truncate">
                · <ClientTime iso={incident.detectedAt} />
              </span>
            )}
          </div>
          {incident.impact && (
            <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">
              {incident.impact}
            </p>
          )}
        </div>
        <span
          aria-hidden
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: severityDot(incident.severity) }}
        />
      </button>

      {canRepair && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={onQuickRepair}
            disabled={repairing}
            className="h-9 flex-1 rounded-xl"
          >
            {repairAction(incident.repairAction)}
          </Button>
          <button
            type="button"
            onClick={onOpen}
            className="h-9 shrink-0 rounded-xl border border-border/60 px-3 text-xs font-medium text-muted-foreground active:bg-muted"
          >
            Detalhes
          </button>
        </div>
      )}
    </div>
  );
}

function repairAction(a: GuardianIncident["repairAction"]) {
  switch (a) {
    case "resend_message":
      return "Reenviar mensagem";
    case "retry_flow":
      return "Retentar fluxo";
    case "toggle_integration":
      return "Alternar integração";
    default:
      return "Inspecionar";
  }
}

function SeverityChip({ severity }: { severity: GuardianSeverity }) {
  const cfg =
    severity === "critical"
      ? { label: "Crítico", cls: "bg-rose-500/15 text-rose-500" }
      : severity === "warning"
        ? { label: "Atenção", cls: "bg-amber-500/15 text-amber-500" }
        : { label: "OK", cls: "bg-emerald-500/15 text-emerald-500" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function severityIconBg(s: GuardianSeverity) {
  return s === "critical"
    ? "bg-rose-500/10"
    : s === "warning"
      ? "bg-amber-500/10"
      : "bg-emerald-500/10";
}
function severityIconColor(s: GuardianSeverity) {
  return s === "critical"
    ? "text-rose-500"
    : s === "warning"
      ? "text-amber-500"
      : "text-emerald-500";
}
function severityDot(s: GuardianSeverity) {
  return s === "critical"
    ? "hsl(var(--destructive))"
    : s === "warning"
      ? "#f59e0b"
      : "#10b981";
}

function MiniKpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "success" | "primary" | "warning" | "danger";
}) {
  const toneClass = {
    success: "text-emerald-500 bg-emerald-500/10",
    primary: "text-primary bg-primary/10",
    warning: "text-amber-500 bg-amber-500/10",
    danger: "text-rose-500 bg-rose-500/10",
  }[tone];
  return (
    <div className="rounded-xl border border-border/50 bg-card px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${toneClass}`}
        >
          {icon}
        </span>
        <span className="truncate text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-0.5 truncate text-base font-bold leading-tight tabular-nums">
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </p>
    </div>
  );
}

/* ---------- states ---------- */

function LoadingState() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2 pt-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-destructive/40 bg-destructive/5 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="font-semibold">Falha ao carregar o Guardião</p>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={onRetry} className="mt-2">
        <RefreshCw className="mr-1 h-4 w-4" /> Tentar novamente
      </Button>
    </div>
  );
}

function EmptyIncidents({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-dashed border-border/60 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
      </div>
      <p className="font-semibold">
        {hasFilter ? "Nenhum incidente neste filtro" : "Tudo saudável"}
      </p>
      <p className="text-sm text-muted-foreground">
        {hasFilter
          ? "Ajuste o filtro ou execute uma nova análise."
          : "Nenhum problema detectado na sua operação."}
      </p>
    </div>
  );
}

function EmptyPermission() {
  return (
    <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-dashed border-border/60 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
        <ShieldAlert className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-semibold">Sem dados do Guardião</p>
      <p className="text-sm text-muted-foreground">
        Verifique sua permissão ou tente executar uma análise.
      </p>
    </div>
  );
}

function readError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Erro inesperado";
}
