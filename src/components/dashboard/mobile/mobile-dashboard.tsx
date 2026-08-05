import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  ShieldCheck,
  MessagesSquare,
  Users,
  Bot,
  Zap,
  ChevronRight,
  Bell,
  Activity,
  Plus,
  MessageSquarePlus,
  UserPlus,
  Workflow,
  Send,
  RefreshCw,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { greetingByHour, type DashboardRange } from "@/components/dashboard/shell/dashboard-header";
import { Sparkline } from "@/components/dashboard/charts/sparkline";
import { TrendBadge } from "@/components/dashboard/charts/trend-badge";
import { subscribeRealtime } from "@/lib/realtime/registry";
import { getDashboardKpis, getUnreadSummary } from "@/lib/analytics.functions";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { cn } from "@/lib/utils";

// Reuse existing widget bodies inside cards
const AiSummaryWidget = lazy(() => import("@/components/dashboard/widgets/ai-summary"));
const ActivityTimelineWidget = lazy(() => import("@/components/dashboard/widgets/activity-timeline"));

const RANGES: Array<{ key: DashboardRange; label: string; days: number }> = [
  { key: "today", label: "Hoje", days: 1 },
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "qtd", label: "Trim.", days: 90 },
];

const QUICK_ACTIONS = [
  { icon: MessageSquarePlus, label: "Nova conversa", to: "/inbox" as const, tone: "bg-sky-500/15 text-sky-600" },
  { icon: UserPlus, label: "Novo contato", to: "/crm" as const, tone: "bg-violet-500/15 text-violet-600" },
  { icon: Workflow, label: "Criar fluxo", to: "/flows" as const, tone: "bg-amber-500/15 text-amber-600" },
  { icon: Bot, label: "Novo agente IA", to: "/agents" as const, tone: "bg-emerald-500/15 text-emerald-600" },
  { icon: Send, label: "Nova campanha", to: "/campaigns" as const, tone: "bg-rose-500/15 text-rose-600" },
  { icon: Zap, label: "Nova automação", to: "/cascades" as const, tone: "bg-indigo-500/15 text-indigo-600" },
] as const;

export function MobileDashboard() {
  const [range, setRange] = useState<DashboardRange>("30d");
  const [displayName, setDisplayName] = useState<string>("");
  const [company, setCompany] = useState<string>("");
  const [quickOpen, setQuickOpen] = useState(false);
  const { setAction } = useMobileFab();

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      const meta = data.user?.user_metadata ?? {};
      setDisplayName(
        (meta.full_name as string | undefined) ??
          data.user?.email?.split("@")[0] ??
          "",
      );
      setCompany((meta.company_name as string | undefined) ?? "");
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setAction({ label: "Ações rápidas", icon: Plus, onClick: () => setQuickOpen(true) });
    return () => setAction(null);
  }, [setAction]);

  const days = RANGES.find((r) => r.key === range)?.days ?? 30;
  const hour = new Date().getHours();
  const timeOfDay = hour < 5 ? "Madrugada" : hour < 12 ? "Manhã" : hour < 18 ? "Tarde" : "Noite";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto momentum-scroll pb-24">
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-4 pb-4 pt-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Sparkles className="h-3 w-3" />
            Comando de operação
            {company && <span className="text-muted-foreground">· {company}</span>}
          </div>
          <h1 className="truncate font-display text-2xl font-black tracking-tight">
            {greetingByHour()}
            {displayName ? `, ${displayName.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{timeOfDay} · {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <HealthMini />
            <PendingMini />
          </div>

          <Link
            to="/reports"
            className="mt-3 flex items-center justify-between rounded-2xl border border-primary/20 bg-background/70 px-4 py-3 no-underline backdrop-blur active:bg-accent/40"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Ver relatórios completos</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </section>

        {/* Range */}
        <div className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-3 py-2 backdrop-blur">
          <div className="flex justify-between gap-1 rounded-full border border-border/60 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  range === r.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 p-3">
          {/* KPIs */}
          <Section title="KPIs em tempo real" hint="Últimos dados">
            <MobileKpis days={days} />
          </Section>

          {/* Alertas */}
          <Section title="Alertas" hint="Prioridade alta primeiro" icon={<Bell className="h-3.5 w-3.5" />}>
            <MobileAlerts />
          </Section>

          {/* Ações rápidas painel */}
          <Section title="Ações rápidas">
            <div className="grid grid-cols-3 gap-2">
              {QUICK_ACTIONS.slice(0, 6).map((a) => (
                <Link
                  key={a.label}
                  to={a.to}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-border/50 bg-card p-3 no-underline active:bg-accent/40"
                >
                  <span className={cn("grid h-10 w-10 place-items-center rounded-2xl", a.tone)}>
                    <a.icon className="h-5 w-5" />
                  </span>
                  <span className="text-center text-[11px] font-medium leading-tight">{a.label}</span>
                </Link>
              ))}
            </div>
          </Section>

          {/* IA */}
          <Section title="Assistente IA" icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}>
            <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
              <div className="min-h-[180px]">
                <AiSummaryWidget />
              </div>
            </Suspense>
          </Section>

          {/* Timeline */}
          <Section title="Atividade recente" hint="Tempo real" icon={<Activity className="h-3.5 w-3.5" />}>
            <div className="rounded-2xl border border-border/50 bg-card p-3">
              <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
                <ActivityTimelineWidget />
              </Suspense>
            </div>
          </Section>
        </div>
      </div>

      {/* Quick actions bottom sheet */}
      <Sheet open={quickOpen} onOpenChange={setQuickOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader>
            <SheetTitle>Ações rápidas</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                onClick={() => setQuickOpen(false)}
                className="flex flex-col items-center gap-2 rounded-2xl p-3 no-underline active:bg-accent/60"
              >
                <span className={cn("grid h-14 w-14 place-items-center rounded-2xl", a.tone)}>
                  <a.icon className="h-6 w-6" />
                </span>
                <span className="text-center text-[12px] font-medium leading-tight">{a.label}</span>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* -------- Section wrapper -------- */

function Section({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {icon}
          {title}
        </div>
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

/* -------- Health mini card -------- */

function HealthMini() {
  const [snap, setSnap] = useState<{ status: string | null; score: number | null } | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("guardian_health_snapshots")
        .select("status, score")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive) setSnap((data ?? null) as { status: string | null; score: number | null } | null);
    })();
    const unsub = subscribeRealtime("mobile-dashboard-health", {
      table: "guardian_health_snapshots",
      event: "INSERT",
      onEvent: (payload) => {
        const row = (payload as { new: { status: string | null; score: number | null } }).new;
        setSnap(row);
      },
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const status = snap?.status ?? "unknown";
  const tone =
    status === "healthy"
      ? "bg-emerald-500/15 text-emerald-600"
      : status === "degraded"
        ? "bg-amber-500/15 text-amber-600"
        : status === "down"
          ? "bg-rose-500/15 text-rose-600"
          : "bg-muted text-muted-foreground";

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border/50 bg-background/70 p-3 backdrop-blur">
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tone)}>
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saúde</p>
        {snap === undefined ? (
          <Skeleton className="mt-0.5 h-4 w-14" />
        ) : (
          <p className="text-sm font-bold capitalize">
            {status === "unknown" ? "—" : status}
          </p>
        )}
      </div>
    </div>
  );
}

function PendingMini() {
  const fetchSummary = useServerFn(getUnreadSummary);
  const q = useQuery({
    queryKey: ["dashboard", "inbox-live"],
    queryFn: () => fetchSummary(),
    staleTime: 15_000,
  });
  const total = (q.data?.items ?? []).reduce((s, i) => s + (i.count || 0), 0);

  return (
    <Link
      to="/inbox"
      className="flex items-center gap-2 rounded-2xl border border-border/50 bg-background/70 p-3 no-underline backdrop-blur active:bg-accent/40"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
        <MessagesSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pendentes</p>
        {q.isPending ? (
          <Skeleton className="mt-0.5 h-4 w-10" />
        ) : (
          <p className="text-sm font-bold tabular-nums">{total}</p>
        )}
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}

/* -------- KPIs (2-col) — reuses dashboard kpis cache -------- */

function MobileKpis({ days }: { days: number }) {
  const fetchKpis = useServerFn(getDashboardKpis);
  const q = useQuery({
    queryKey: ["dashboard", "kpis", days],
    queryFn: () => fetchKpis({ data: { days } }),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (q.isPending) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <span>Erro ao carregar KPIs</span>
        <button onClick={() => q.refetch()} aria-label="Tentar novamente">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const d = q.data!;
  const inbound = d.volumeSeries.slice(-14).map((v) => v.inbound);
  const outbound = d.volumeSeries.slice(-14).map((v) => v.outbound);
  const total = d.volumeSeries.slice(-14).map((v) => v.inbound + v.outbound);
  const trend = (arr: number[]) => {
    if (arr.length < 6) return 0;
    const r = arr.slice(-3).reduce((a, b) => a + b, 0);
    const p = arr.slice(-6, -3).reduce((a, b) => a + b, 0);
    if (!p) return r > 0 ? 100 : 0;
    return ((r - p) / p) * 100;
  };
  const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));

  const items = [
    { label: "Conversas abertas", value: fmt(d.conversationsOpen), icon: MessagesSquare, tone: "bg-sky-500/15 text-sky-600", chart: "--color-chart-1", series: total, trend: trend(total) },
    { label: "Novos contatos", value: fmt(d.contactsNew), icon: Users, tone: "bg-violet-500/15 text-violet-600", chart: "--color-chart-3", series: inbound, trend: trend(inbound) },
    { label: "Enviadas", value: fmt(d.messagesOut), icon: Bot, tone: "bg-amber-500/15 text-amber-600", chart: "--color-chart-4", series: outbound, trend: trend(outbound) },
    { label: "Cascatas ativas", value: fmt(d.cascadesRunning), icon: Zap, tone: "bg-emerald-500/15 text-emerald-600", chart: "--color-chart-2", series: total, trend: 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((k) => (
        <div key={k.label} className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-card p-3">
          <div className="flex items-center justify-between">
            <span className={cn("grid h-8 w-8 place-items-center rounded-xl", k.tone)}>
              <k.icon className="h-4 w-4" />
            </span>
            {k.trend !== 0 && <TrendBadge value={k.trend} />}
          </div>
          <div>
            <p className="font-display text-2xl font-black tabular-nums leading-none">{k.value}</p>
            <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {k.label}
            </p>
          </div>
          <div className="-mx-1 -mb-1 opacity-80">
            <Sparkline data={k.series} colorVar={k.chart} width={140} height={28} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------- Alerts: incidents + inbox pending — combined, prioritized -------- */

type Incident = { id: string; severity: string; status: string; message: string; kind: string };

function MobileAlerts() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("guardian_incidents")
        .select("id, severity, status, message, kind")
        .in("status", ["open", "investigating"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (alive) setIncidents((data ?? []) as Incident[]);
    })();
    const unsub = subscribeRealtime("mobile-dashboard-alerts", {
      table: "guardian_incidents",
      onEvent: async () => {
        const { data } = await supabase
          .from("guardian_incidents")
          .select("id, severity, status, message, kind")
          .in("status", ["open", "investigating"])
          .order("created_at", { ascending: false })
          .limit(5);
        setIncidents((data ?? []) as Incident[]);
      },
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  if (incidents === null) return <Skeleton className="h-24 w-full rounded-2xl" />;

  if (incidents.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
        <div>
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">Nenhum alerta</p>
          <p className="text-xs text-muted-foreground">Sistema saudável.</p>
        </div>
      </div>
    );
  }

  const sev = { critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>;
  const sorted = [...incidents].sort((a, b) => (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0));

  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((i) => (
        <li
          key={i.id}
          className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card px-3 py-2.5"
        >
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              i.severity === "critical" && "bg-rose-500",
              i.severity === "high" && "bg-orange-500",
              i.severity === "medium" && "bg-amber-500",
              i.severity === "low" && "bg-sky-500",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{i.message ?? i.kind ?? "Incidente"}</span>
          <Badge variant="outline" className="text-[10px] capitalize">
            {i.severity}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
