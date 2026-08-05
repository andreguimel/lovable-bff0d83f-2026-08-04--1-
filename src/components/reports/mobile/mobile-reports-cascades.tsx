import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Ban,
  CheckCircle2,
  Download,
  Filter,
  Layers,
  Workflow,
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
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { listCascadesReport, exportReportCsv } from "@/lib/reports.functions";
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
import { Sparkbars } from "./sparkline";

type Row = Awaited<ReturnType<typeof listCascadesReport>>[number];

export function MobileReportsCascades() {
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
    queryKey: ["report-cascades", days],
    queryFn: () => listCascadesReport({ data: { days } }),
  });

  const rows: Row[] = q.data ?? [];

  const kpis = useMemo(() => {
    const totalRuns = rows.reduce((s, r) => s + (r.total_runs ?? 0), 0);
    const success = rows.reduce((s, r) => s + r.delivered + r.read, 0);
    const running = rows.reduce((s, r) => s + r.running, 0);
    const exhausted = rows.reduce((s, r) => s + r.exhausted, 0);
    return {
      policies: rows.length,
      totalRuns,
      success,
      running,
      exhausted,
      rate: totalRuns > 0 ? Math.round((success / totalRuns) * 100) : 0,
    };
  }, [rows]);

  const { setAction } = useMobileFab();
  useEffect(() => {
    setAction({
      label: "Exportar CSV",
      icon: Download,
      onClick: async () => {
        try {
          const res = await exportReportCsv({ data: { type: "cascades", days } });
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
              Cascatas
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {kpis.policies} políticas · {kpis.rate}% sucesso
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
            label="Execuções"
            value={kpis.totalRuns.toLocaleString("pt-BR")}
            icon={<Layers className="h-3.5 w-3.5" />}
            tone="primary"
            hint={`${days} dias`}
          />
          <KpiCard
            label="Sucesso"
            value={`${kpis.rate}%`}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            tone="success"
            hint={`${kpis.success} entregues`}
          />
          <KpiCard
            label="Ativas"
            value={kpis.running}
            icon={<Activity className="h-3.5 w-3.5" />}
            tone={kpis.running > 0 ? "primary" : "default"}
          />
          <KpiCard
            label="Esgotadas"
            value={kpis.exhausted}
            icon={<Ban className="h-3.5 w-3.5" />}
            tone={kpis.exhausted > 0 ? "danger" : "default"}
          />
        </div>

        <OfflineHint visible={!online} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {q.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Workflow className="h-5 w-5" />}
            title="Nenhuma cascata cadastrada"
            description="Crie políticas de cascata em Fluxos para acompanhar a performance por passo."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.id}>
                <CascadeCard p={p} onOpen={() => setSelected(p)} />
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

      <CascadeDetailSheet row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CascadeCard({ p, onOpen }: { p: Row; onOpen: () => void }) {
  const success = p.delivered + p.read;
  const rate = p.total_runs > 0 ? Math.round((success / p.total_runs) * 100) : 0;
  const perStepValues = p.per_step.map((s) => s.sent);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-border/50 bg-card/70 p-3 text-left transition active:scale-[0.99]"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{p.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {p.total_runs} execuções · {rate}% sucesso
          </div>
        </div>
        <Badge variant={p.active ? "default" : "secondary"} className="shrink-0">
          {p.active ? "Ativa" : "Pausada"}
        </Badge>
      </div>

      {perStepValues.length > 0 ? (
        <div className="mt-3">
          <Sparkbars
            values={perStepValues}
            colorClass="fill-primary/80"
            height={28}
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Passos {p.per_step.length}</span>
            <span>{perStepValues.reduce((s, v) => s + v, 0)} envios</span>
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px]">
        <MiniStat value={p.total_runs} label="Total" />
        <MiniStat value={success} label="Entr." tone="text-emerald-500" />
        <MiniStat value={p.running} label="Ativas" tone="text-primary" />
        <MiniStat value={p.exhausted} label="Esg." tone={p.exhausted > 0 ? "text-rose-500" : undefined} />
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

function CascadeDetailSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-border/60 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="truncate font-display">{row?.name}</SheetTitle>
          <SheetDescription>
            {row?.active ? "Política ativa" : "Política pausada"}
          </SheetDescription>
        </SheetHeader>
        {row ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Info label="Execuções" value={String(row.total_runs)} />
              <Info label="Entregues" value={String(row.delivered + row.read)} />
              <Info label="Ativas" value={String(row.running)} />
              <Info label="Esgotadas" value={String(row.exhausted)} />
              <Info label="Canceladas" value={String(row.cancelled)} />
              <Info
                label="Sucesso"
                value={`${row.total_runs > 0 ? Math.round(((row.delivered + row.read) / row.total_runs) * 100) : 0}%`}
              />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Envios por passo
              </div>
              {row.per_step.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem passos configurados.</p>
              ) : (
                <ol className="space-y-2">
                  {row.per_step.map((s) => (
                    <li
                      key={s.step}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-muted/40 px-3 py-2"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {s.step}
                      </span>
                      <span className="min-w-0 truncate text-sm capitalize">{s.channel}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums">
                        {s.sent.toLocaleString("pt-BR")}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
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
