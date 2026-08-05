import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  MoreVertical,
  Plus,
  Search,
  Send,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientTime } from "@/components/client-time";
import { useRealtimeBroadcasts } from "@/hooks/use-realtime-broadcasts";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import {
  deleteBroadcast,
  listBroadcasts,
} from "@/lib/broadcasts.functions";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { BroadcastStatusBadge } from "@/components/campaigns/status-badge";
import { MobileCampaignActionsSheet } from "./mobile-campaign-actions-sheet";
import { MobileCampaignDetailSheet } from "./mobile-campaign-detail-sheet";

type Broadcast = Awaited<ReturnType<typeof listBroadcasts>>[number];

const CHIPS: Array<{ id: string; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "sending", label: "Ativas" },
  { id: "scheduled", label: "Agendadas" },
  { id: "paused", label: "Pausadas" },
  { id: "completed", label: "Finalizadas" },
  { id: "failed", label: "Erro" },
  { id: "draft", label: "Rascunhos" },
];

/**
 * Mobile-native Campaigns home — cards, chips, KPI strip, bottom sheets.
 * Reuses `listBroadcasts`, `deleteBroadcast`, `useRealtimeBroadcasts`,
 * `CampaignWizard`, and the desktop status badge. No business logic
 * changes.
 */
export function MobileCampaignsHome() {
  useRealtimeBroadcasts();
  const qc = useQueryClient();
  const listFn = useServerFn(listBroadcasts);
  const del = useServerFn(deleteBroadcast);

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<Broadcast | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { setAction } = useMobileFab();
  useEffect(() => {
    setAction({
      label: "Nova campanha",
      icon: Plus,
      onClick: () => setWizardOpen(true),
    });
    return () => setAction(null);
  }, [setAction]);

  const q = useQuery({ queryKey: ["broadcasts"], queryFn: () => listFn() });

  const rows = useMemo(() => {
    const data = q.data ?? [];
    return data.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (
        search &&
        !r.name.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [q.data, filter, search]);

  const kpis = useMemo(() => {
    const data = q.data ?? [];
    const sent = data.reduce((s, r) => s + (r.sent_count ?? 0), 0);
    const delivered = data.reduce((s, r) => s + (r.delivered_count ?? 0), 0);
    const failed = data.reduce((s, r) => s + (r.failed_count ?? 0), 0);
    return {
      active: data.filter(
        (r) => r.status === "sending" || r.status === "scheduled",
      ).length,
      sent,
      delivered,
      failed,
      deliveryRate: sent ? Math.round((delivered / sent) * 100) : 0,
    };
  }, [q.data]);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Campanha excluída");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-background/90 px-4 pt-3 pb-2 backdrop-blur">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight">
              Campanhas
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {kpis.active} ativas · {kpis.deliveryRate}% entrega
            </p>
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar campanha…"
            className="h-11 rounded-full border-border/60 bg-muted/40 pl-9"
          />
        </div>

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

        <div className="mt-3 grid grid-cols-4 gap-2 pb-1">
          <MiniKpi
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Ativas"
            value={kpis.active}
            tone="success"
          />
          <MiniKpi
            icon={<Send className="h-3.5 w-3.5" />}
            label="Enviadas"
            value={kpis.sent}
            tone="primary"
            compact
          />
          <MiniKpi
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Entrega"
            value={`${kpis.deliveryRate}%`}
            tone="warning"
          />
          <MiniKpi
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Falhas"
            value={kpis.failed}
            tone="danger"
            compact
          />
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            hasFilter={!!search || filter !== "all"}
            onCreate={() => setWizardOpen(true)}
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id}>
                <CampaignCard
                  c={c}
                  onOpen={() => setDetailId(c.id)}
                  onActions={() => setActionsFor(c)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <MobileCampaignDetailSheet
        id={detailId}
        open={!!detailId}
        onOpenChange={(v) => !v && setDetailId(null)}
      />
      <MobileCampaignActionsSheet
        broadcast={actionsFor}
        open={!!actionsFor}
        onOpenChange={(v) => !v && setActionsFor(null)}
        onOpenDetail={() => setDetailId(actionsFor?.id ?? null)}
        onConfirmDelete={() => setConfirmDelete(actionsFor?.id ?? null)}
      />
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove a campanha e seus destinatários. Não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) delMut.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CampaignCard({
  c,
  onOpen,
  onActions,
}: {
  c: Broadcast;
  onOpen: () => void;
  onActions: () => void;
}) {
  const pct = c.total_recipients
    ? Math.round(((c.sent_count ?? 0) / c.total_recipients) * 100)
    : 0;
  const channelColor =
    (c.channel as { color?: string } | null)?.color ?? "hsl(var(--primary))";
  const channelName = c.channel?.name;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm active:bg-muted/30">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 text-left focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: channelColor }}
              aria-hidden
            />
            <p className="truncate text-[15px] font-semibold">{c.name}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <BroadcastStatusBadge status={c.status} />
            {channelName && <span>· {channelName}</span>}
            <span>
              · {(c.total_recipients ?? 0).toLocaleString("pt-BR")} contatos
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={onActions}
          aria-label="Ações"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 block w-full text-left focus:outline-none"
      >
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Progresso</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
          <MetricCell label="Env" value={c.sent_count ?? 0} />
          <MetricCell label="Entr" value={c.delivered_count ?? 0} />
          <MetricCell label="Lid" value={c.read_count ?? 0} />
          <MetricCell
            label="Falh"
            value={c.failed_count ?? 0}
            tone={(c.failed_count ?? 0) > 0 ? "danger" : undefined}
          />
        </div>
        {(c.scheduled_at || c.started_at) && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {c.status === "scheduled" && c.scheduled_at ? (
              <>Agendada · <ClientTime iso={c.scheduled_at} /></>
            ) : c.started_at ? (
              <>Iniciada · <ClientTime iso={c.started_at} /></>
            ) : null}
          </p>
        )}
      </button>
    </div>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  tone,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "success" | "primary" | "warning" | "danger";
  compact?: boolean;
}) {
  const toneClass = {
    success: "text-success bg-success/10",
    primary: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/10",
    danger: "text-destructive bg-destructive/10",
  }[tone];
  const display =
    typeof value === "number" && compact
      ? new Intl.NumberFormat("pt-BR", {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value)
      : typeof value === "number"
        ? value.toLocaleString("pt-BR")
        : value;
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
        {display}
      </p>
    </div>
  );
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg bg-muted/50 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-xs font-semibold tabular-nums ${
          tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function EmptyState({
  hasFilter,
  onCreate,
}: {
  hasFilter: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-dashed border-border/60 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
        <BarChart3 className="h-6 w-6 text-primary" />
      </div>
      <p className="font-semibold">
        {hasFilter ? "Nenhum resultado" : "Nenhuma campanha ainda"}
      </p>
      <p className="text-sm text-muted-foreground">
        {hasFilter
          ? "Ajuste a busca ou o filtro."
          : "Crie sua primeira campanha para disparar mensagens em massa."}
      </p>
      {!hasFilter && (
        <Button onClick={onCreate} className="mt-2">
          <Plus className="mr-1 h-4 w-4" /> Nova campanha
        </Button>
      )}
    </div>
  );
}
