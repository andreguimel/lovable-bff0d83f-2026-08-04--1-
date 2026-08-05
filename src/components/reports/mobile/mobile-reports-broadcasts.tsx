import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  Megaphone,
  Send,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ClientTime } from "@/components/client-time";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { listBroadcastsReport, exportReportCsv } from "@/lib/reports.functions";
import { downloadCsv } from "@/lib/download-csv";
import {
  MobileReportsFiltersSheet,
  useFiltersSheet,
} from "./mobile-reports-filters-sheet";
import {
  EmptyState,
  ErrorState,
  KpiCard,
  OfflineHint,
  SkeletonBlock,
} from "./mobile-report-parts";
import { Sparkbars, StackedBar } from "./sparkline";

type Row = Awaited<ReturnType<typeof listBroadcastsReport>>[number];

const STATUS_TONE: Record<string, string> = {
  sending: "bg-primary/15 text-primary",
  scheduled: "bg-amber-500/15 text-amber-500",
  completed: "bg-emerald-500/15 text-emerald-500",
  failed: "bg-rose-500/15 text-rose-500",
  paused: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

export function MobileReportsBroadcasts() {
  const [days, setDays] = useState<30 | 90 | 180>(90);
  const [selected, setSelected] = useState<Row | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const filters = useFiltersSheet();

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const q = useQuery({
    queryKey: ["report-broadcasts", days],
    queryFn: () => listBroadcastsReport({ data: { days } }),
  });

  const rows: Row[] = q.data ?? [];

  const kpis = useMemo(() => {
    const sent = rows.reduce((s, r) => s + (r.sent_count ?? 0), 0);
    const delivered = rows.reduce((s, r) => s + (r.delivered_count ?? 0), 0);
    const read = rows.reduce((s, r) => s + (r.read_count ?? 0), 0);
    const failed = rows.reduce((s, r) => s + (r.failed_count ?? 0), 0);
    return {
      count: rows.length,
      sent,
      delivered,
      read,
      failed,
      readRate: sent > 0 ? Math.round((read / sent) * 100) : 0,
      deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
    };
  }, [rows]);

  // Sparkbar of broadcasts started per week
  const spark = useMemo(() => {
    const weeks = Math.max(4, Math.ceil(days / 7));
    const buckets = new Array(weeks).fill(0);
    const now = Date.now();
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      const w = Math.floor((now - t) / (1000 * 60 * 60 * 24 * 7));
      const idx = weeks - 1 - w;
      if (idx >= 0 && idx < weeks) buckets[idx] += 1;
    }
    return buckets;
  }, [rows, days]);

  const { setAction } = useMobileFab();
  useEffect(() => {
    setAction({
      label: "Exportar CSV",
      icon: Download,
      onClick: async () => {
        try {
          const res = await exportReportCsv({ data: { type: "broadcasts", days } });
          downloadCsv(res.filename, res.csv);
          toast.success("CSV exportado");
        } catch (e) {
          toast.error("Falha ao exportar", { description: (e as Error).message });
        }
      },
    });
    return () => setAction(null);
  }, [setAction, days]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/50 bg-background/90 px-4 pt-3 pb-3 backdrop-blur">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight">
              Broadcasts
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {kpis.count} campanhas · {kpis.deliveryRate}% entrega
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full"
            onClick={() => filters.setOpen(true)}
            aria-label="Abrir filtros"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <KpiCard
            label="Enviadas"
            value={kpis.sent.toLocaleString("pt-BR")}
            icon={<Send className="h-3.5 w-3.5" />}
            tone="primary"
            hint={`${days} dias`}
            spark={<Sparkbars values={spark} height={26} />}
          />
          <KpiCard
            label="Entrega"
            value={`${kpis.deliveryRate}%`}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            tone="success"
            hint={`${kpis.delivered.toLocaleString("pt-BR")} entregues`}
          />
          <KpiCard
            label="Leitura"
            value={`${kpis.readRate}%`}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            tone="default"
            hint={`${kpis.read.toLocaleString("pt-BR")} lidas`}
          />
          <KpiCard
            label="Falhas"
            value={kpis.failed.toLocaleString("pt-BR")}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            tone={kpis.failed > 0 ? "danger" : "default"}
          />
        </div>

        <OfflineHint visible={!online} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {q.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="Nenhum broadcast no período"
            description="Assim que uma campanha for enviada, ela aparecerá aqui."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <BroadcastCard r={r} onOpen={() => setSelected(r)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <MobileReportsFiltersSheet
        open={filters.open}
        onOpenChange={filters.setOpen}
        days={days}
        onDaysChange={(d) => setDays(d as 30 | 90 | 180)}
        allowedPeriods={[30, 90, 180]}
      />

      <BroadcastDetailSheet row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function BroadcastCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const total = r.sent_count ?? 0;
  const delivered = r.delivered_count ?? 0;
  const read = r.read_count ?? 0;
  const failed = r.failed_count ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-border/50 bg-card/70 p-3 text-left transition active:scale-[0.99]"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{r.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {r.channel_name ?? "Canal —"} · <ClientTime iso={r.created_at} />
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground"}`}
        >
          {r.status}
        </span>
      </div>

      <div className="mt-3">
        <StackedBar
          height={8}
          segments={[
            { value: read, className: "bg-emerald-500", label: "Lidas" },
            {
              value: Math.max(0, delivered - read),
              className: "bg-primary",
              label: "Entregues",
            },
            {
              value: Math.max(0, total - delivered - failed),
              className: "bg-muted-foreground/30",
              label: "Enviadas",
            },
            { value: failed, className: "bg-rose-500", label: "Falhas" },
          ]}
        />
        <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
          <MiniStat value={r.total_recipients ?? 0} label="Alvo" />
          <MiniStat value={total} label="Env." tone="text-primary" />
          <MiniStat value={read} label="Lidas" tone="text-emerald-500" />
          <MiniStat value={failed} label="Falhas" tone={failed > 0 ? "text-rose-500" : undefined} />
        </div>
      </div>
    </button>
  );
}

function MiniStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className={`font-display text-sm font-bold tabular-nums ${tone ?? ""}`}>
        {value.toLocaleString("pt-BR")}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function BroadcastDetailSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-border/60 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="truncate font-display">{row?.name}</SheetTitle>
          <SheetDescription className="truncate">
            {row?.channel_name ?? "Canal —"}
          </SheetDescription>
        </SheetHeader>
        {row ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Info label="Status" value={<Badge variant="secondary" className="capitalize">{row.status}</Badge>} />
              <Info label="Criado" value={<ClientTime iso={row.created_at} />} />
              <Info label="Destinatários" value={(row.total_recipients ?? 0).toLocaleString("pt-BR")} />
              <Info label="Enviados" value={(row.sent_count ?? 0).toLocaleString("pt-BR")} />
              <Info label="Entregues" value={(row.delivered_count ?? 0).toLocaleString("pt-BR")} />
              <Info label="Lidos" value={(row.read_count ?? 0).toLocaleString("pt-BR")} />
              <Info label="Falhas" value={(row.failed_count ?? 0).toLocaleString("pt-BR")} />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Distribuição
              </div>
              <StackedBar
                height={10}
                segments={[
                  { value: row.read_count ?? 0, className: "bg-emerald-500", label: "Lidas" },
                  {
                    value: Math.max(0, (row.delivered_count ?? 0) - (row.read_count ?? 0)),
                    className: "bg-primary",
                    label: "Entregues",
                  },
                  {
                    value: Math.max(
                      0,
                      (row.sent_count ?? 0) - (row.delivered_count ?? 0) - (row.failed_count ?? 0),
                    ),
                    className: "bg-muted-foreground/30",
                    label: "Enviadas",
                  },
                  { value: row.failed_count ?? 0, className: "bg-rose-500", label: "Falhas" },
                ]}
              />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm">{value}</div>
    </div>
  );
}
