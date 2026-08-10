import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessagesSquare, Users, Bot, Zap } from "lucide-react";
import { motion } from "framer-motion";

import { getDashboardKpis } from "@/lib/analytics.functions";
import { useDashboardRange } from "@/components/dashboard/shell/dashboard-header";
import { WidgetSkeleton } from "@/components/dashboard/shell/widget-skeleton";
import { WidgetError } from "@/components/dashboard/shell/widget-error";
import { Sparkline } from "@/components/dashboard/charts/sparkline";
import { TrendBadge } from "@/components/dashboard/charts/trend-badge";
import { cn } from "@/lib/utils";

type KpiTone = "sky" | "violet" | "amber" | "emerald";
const TONE_MAP: Record<KpiTone, { color: string; bg: string; ring: string }> = {
  sky: {
    color: "--color-chart-1",
    bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    ring: "ring-sky-500/20",
  },
  violet: {
    color: "--color-chart-3",
    bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
  },
  amber: {
    color: "--color-chart-4",
    bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  emerald: {
    color: "--color-chart-2",
    bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
  },
};

export default function KpiRowWidget() {
  const { days, range } = useDashboardRange();
  const fetchKpis = useServerFn(getDashboardKpis);
  const q = useQuery({
    queryKey: ["dashboard", "kpis", days],
    queryFn: () => fetchKpis({ data: { days } }),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (q.isPending) return <WidgetSkeleton variant="kpi" />;
  if (q.error) return <WidgetError message={String(q.error)} onRetry={() => q.refetch()} />;

  const d = q.data!;
  const inboundSeries = d.volumeSeries.slice(-14).map((v) => v.inbound);
  const outboundSeries = d.volumeSeries.slice(-14).map((v) => v.outbound);
  const totalSeries = d.volumeSeries.slice(-14).map((v) => v.inbound + v.outbound);

  // trend simples: últimos 3 vs. anteriores 3
  const trend = (arr: number[]) => {
    if (arr.length < 6) return 0;
    const recent = arr.slice(-3).reduce((a, b) => a + b, 0);
    const prior = arr.slice(-6, -3).reduce((a, b) => a + b, 0);
    if (!prior) return recent > 0 ? 100 : 0;
    return ((recent - prior) / prior) * 100;
  };

  const periodHint =
    range === "today"
      ? "hoje"
      : range === "7d"
        ? "últimos 7 dias"
        : range === "30d"
          ? "últimos 30 dias"
          : range === "qtd"
            ? "últimos 90 dias"
            : "todo o período";

  const items: Array<{
    label: string;
    value: string;
    hint: string;
    icon: typeof MessagesSquare;
    tone: KpiTone;
    series: number[];
    trend: number;
  }> = [
    {
      label: "Conversas abertas",
      value: fmt(d.conversationsOpen),
      hint: "em aberto / pendentes",
      icon: MessagesSquare,
      tone: "sky",
      series: totalSeries,
      trend: trend(totalSeries),
    },
    {
      label: "Novos contatos",
      value: fmt(d.contactsNew),
      hint: periodHint,
      icon: Users,
      tone: "violet",
      series: inboundSeries,
      trend: trend(inboundSeries),
    },
    {
      label: "Mensagens enviadas",
      value: fmt(d.messagesOut),
      hint: `${d.readRate ? (d.readRate * 100).toFixed(0) + "% lidas" : "sem leitura"}`,
      icon: Bot,
      tone: "amber",
      series: outboundSeries,
      trend: trend(outboundSeries),
    },
    {
      label: "Cascatas ativas",
      value: fmt(d.cascadesRunning),
      hint: "políticas em execução",
      icon: Zap,
      tone: "emerald",
      series: totalSeries,
      trend: 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((k, i) => {
        const tone = TONE_MAP[k.tone];
        return (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35, ease: "easeOut" }}
            className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 ring-1 ring-inset ring-transparent transition hover:ring-border"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", tone.bg)}
                  >
                    <k.icon className="h-4 w-4" />
                  </div>
                  <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {k.label}
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <div className="font-display text-3xl font-black tracking-tight tabular-nums text-foreground">
                    {k.value}
                  </div>
                  {k.trend !== 0 && <TrendBadge value={k.trend} />}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{k.hint}</div>
              </div>
              <div className="shrink-0 opacity-90">
                <Sparkline data={k.series} colorVar={tone.color} width={80} height={32} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
