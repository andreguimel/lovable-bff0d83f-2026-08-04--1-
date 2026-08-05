import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Filter,
  Inbox,
  MessageSquare,
  Search as SearchIcon,
  Timer,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
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
import { listConversationsReport, exportReportCsv } from "@/lib/reports.functions";
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

type Row = Awaited<ReturnType<typeof listConversationsReport>>[number];

const STATUS_TONE: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-500",
  pending: "bg-amber-500/15 text-amber-500",
  resolved: "bg-muted text-muted-foreground",
};

/**
 * Mobile-native Conversations report — KPI hero, filter sheet, card list.
 * Reuses `listConversationsReport` and `exportReportCsv`; zero backend or
 * contract changes.
 */
export function MobileReportsConversations() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [selected, setSelected] = useState<Row | null>(null);
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
    queryKey: ["report-conversations", days, status, search],
    queryFn: () =>
      listConversationsReport({
        data: {
          days,
          status: status === "all" ? undefined : status,
          search: search || undefined,
        },
      }),
  });

  const rows: Row[] = q.data ?? [];

  const kpis = useMemo(() => {
    const total = rows.length;
    const unread = rows.reduce((s, r) => s + (r.unread_count ?? 0), 0);
    const open = rows.filter((r) => r.status === "open").length;
    const resolved = rows.filter((r) => r.status === "resolved").length;
    const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    return { total, unread, open, resolved, rate };
  }, [rows]);

  // Sparkline: conversations created per day within the window.
  const spark = useMemo(() => {
    const buckets = new Array(days).fill(0);
    const now = Date.now();
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      const bucket = Math.floor((now - t) / (1000 * 60 * 60 * 24));
      const idx = days - 1 - bucket;
      if (idx >= 0 && idx < days) buckets[idx] += 1;
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
          const res = await exportReportCsv({ data: { type: "conversations", days } });
          downloadCsv(res.filename, res.csv);
          toast.success("CSV exportado");
        } catch (e) {
          toast.error("Falha ao exportar", { description: (e as Error).message });
        }
      },
    });
    return () => setAction(null);
  }, [setAction, days]);

  const hasFilter = status !== "all" || !!search;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/50 bg-background/90 px-4 pt-3 pb-3 backdrop-blur">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight">
              Conversas
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {kpis.total} no período · {kpis.rate}% resolvidas
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
            {hasFilter ? (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            ) : null}
          </Button>
        </div>

        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contato ou mensagem"
            className="h-11 rounded-full border-border/60 bg-muted/40 pl-9"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <KpiCard
            label="Conversas"
            value={kpis.total}
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            tone="primary"
            hint={`${days} dias`}
            spark={<Sparkbars values={spark} height={26} />}
          />
          <KpiCard
            label="Resolvidas"
            value={`${kpis.rate}%`}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            tone="success"
            hint={`${kpis.resolved} de ${kpis.total}`}
          />
          <KpiCard
            label="Não lidas"
            value={kpis.unread}
            icon={<Inbox className="h-3.5 w-3.5" />}
            tone={kpis.unread > 0 ? "warning" : "default"}
          />
          <KpiCard
            label="Abertas"
            value={kpis.open}
            icon={<Timer className="h-3.5 w-3.5" />}
            tone="default"
          />
        </div>

        <OfflineHint visible={!online} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {q.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" />}
            title={hasFilter ? "Nenhum resultado" : "Nenhuma conversa no período"}
            description={
              hasFilter
                ? "Ajuste os filtros ou aumente o período."
                : "Assim que houver atividade, as conversas aparecerão aqui."
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-border/50 bg-card/70 p-3 text-left transition active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold">
                        {r.contact_name ?? r.contact_phone ?? "—"}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {r.last_message_preview ?? "Sem prévia disponível"}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{r.channel_name ?? "Canal —"}</span>
                      <span aria-hidden>·</span>
                      <ClientTime iso={r.last_message_at ?? r.created_at} />
                    </div>
                  </div>
                  {r.unread_count > 0 ? (
                    <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {r.unread_count}
                    </span>
                  ) : (
                    <span aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MobileReportsFiltersSheet
        open={filters.open}
        onOpenChange={filters.setOpen}
        days={days}
        onDaysChange={(d) => setDays(d as 7 | 30 | 90)}
        allowedPeriods={[7, 30, 90]}
        status={status}
        onStatusChange={setStatus}
        search={search}
        onSearchChange={setSearch}
        onClear={() => {
          setStatus("all");
          setSearch("");
        }}
      />

      <ConversationDetailSheet row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ConversationDetailSheet({
  row,
  onClose,
}: {
  row: Row | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-border/60 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="truncate font-display">
            {row?.contact_name ?? row?.contact_phone ?? "Conversa"}
          </SheetTitle>
          <SheetDescription className="truncate">
            {row?.channel_name ?? "Canal —"}
          </SheetDescription>
        </SheetHeader>
        {row ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Status" value={<Badge variant="secondary" className="capitalize">{row.status}</Badge>} />
              <Field label="Não lidas" value={String(row.unread_count)} />
              <Field
                label="Criada"
                value={<ClientTime iso={row.created_at} />}
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Última mensagem
              </div>
              <p className="rounded-2xl bg-muted/50 p-3 text-sm">
                {row.last_message_preview ?? "Sem prévia disponível"}
              </p>
              {row.last_message_at ? (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  <ClientTime iso={row.last_message_at} />
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Field label="Telefone" value={row.contact_phone ?? "—"} />
              <Field label="ID" value={<span className="truncate font-mono">{row.id.slice(0, 8)}…</span>} />
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm">{value}</div>
    </div>
  );
}
