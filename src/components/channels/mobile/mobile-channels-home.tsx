import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Archive,
  MoreVertical,
  Pause,
  Plus,
  QrCode,
  Search,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { deleteChannel, listChannels } from "@/lib/channels.functions";
import { useRealtimeChannels } from "@/hooks/use-realtime-channels";
import { useStevoStatusSync } from "@/hooks/use-stevo-status-sync";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { ChannelFormSheet } from "@/components/channels/channel-form-sheet";
import { QrConnectDialog } from "@/components/channels/qr-connect-dialog";
import { ChannelStatusBadge } from "@/components/channels/channel-status-badge";
import { Sparkline } from "@/components/channels/sparkline";
import { MobileChannelActionsSheet } from "./mobile-channel-actions-sheet";
import { MobileChannelDetailSheet } from "./mobile-channel-detail-sheet";

type ChannelRow = Awaited<ReturnType<typeof listChannels>>[number];

const STATUS_CHIPS: Array<{ id: string; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "connected", label: "Conectados" },
  { id: "connecting", label: "Conectando" },
  { id: "disconnected", label: "Offline" },
  { id: "paused", label: "Pausados" },
];

/**
 * Mobile-native Channels home — cards, chip filters, KPI strip, bottom
 * sheets for actions/detail. Reuses `listChannels`, ChannelFormSheet,
 * QrConnectDialog and the realtime hook. No backend / logic changes.
 */
export function MobileChannelsHome() {
  useRealtimeChannels();
  useStevoStatusSync();
  const qc = useQueryClient();
  const list = useServerFn(listChannels);
  const del = useServerFn(deleteChannel);

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [qrChannelId, setQrChannelId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<ChannelRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { setAction } = useMobileFab();
  useEffect(() => {
    setAction({
      label: "Novo canal",
      icon: Plus,
      onClick: () => {
        setEditing(null);
        setOpenForm(true);
      },
    });
    return () => setAction(null);
  }, [setAction]);

  const channels = useQuery({
    queryKey: ["channels", { includeArchived: showArchived }],
    queryFn: () => list({ data: { includeArchived: showArchived } }),
  });

  const rows = useMemo(() => {
    return (channels.data ?? []).filter((c) => {
      if (showArchived ? !c.archived_at : !!c.archived_at) return false;
      if (status === "paused" && !c.paused_at) return false;
      if (status !== "all" && status !== "paused" && c.status !== status) return false;
      if (
        search &&
        !`${c.name} ${c.phone_number ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [channels.data, showArchived, status, search]);

  const totals = useMemo(
    () => ({
      active: rows.filter((r) => r.status === "connected" && !r.paused_at).length,
      msgs24: rows.reduce((s, r) => s + (r.messages_24h ?? 0), 0),
      connecting: rows.filter((r) => r.status === "connecting").length,
      paused: rows.filter((r) => r.paused_at).length,
    }),
    [rows],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-background/90 px-4 pt-3 pb-2 backdrop-blur">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight">
              Canais
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {totals.active} conectados · {totals.msgs24} msgs 24h
            </p>
          </div>
          <Button
            variant={showArchived ? "default" : "ghost"}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            onClick={() => setShowArchived((v) => !v)}
            aria-label="Arquivados"
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar canal ou número…"
            className="h-11 rounded-full border-border/60 bg-muted/40 pl-9"
          />
        </div>

        {/* Status chips */}
        <div className="-mx-4 mt-3 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-1.5 pb-1">
            {STATUS_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setStatus(c.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  status === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI mini strip */}
        <div className="mt-3 grid grid-cols-4 gap-2 pb-1">
          <MiniKpi icon={<Zap className="h-3.5 w-3.5" />} label="Ativos" value={totals.active} tone="success" />
          <MiniKpi icon={<Activity className="h-3.5 w-3.5" />} label="Conec." value={totals.connecting} tone="warning" />
          <MiniKpi icon={<Pause className="h-3.5 w-3.5" />} label="Pausa" value={totals.paused} tone="muted" />
          <MiniKpi icon={<QrCode className="h-3.5 w-3.5" />} label="Total" value={rows.length} tone="primary" />
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {channels.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_v, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            archived={showArchived}
            hasFilter={!!search || status !== "all"}
            onCreate={() => {
              setEditing(null);
              setOpenForm(true);
            }}
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((ch) => (
              <li key={ch.id}>
                <ChannelCard
                  ch={ch}
                  onOpen={() => setDetailId(ch.id)}
                  onActions={() => setActionsFor(ch)}
                  onConnect={() => setQrChannelId(ch.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sheets & dialogs */}
      <ChannelFormSheet
        open={openForm}
        onOpenChange={setOpenForm}
        existing={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                phone_number: editing.phone_number,
                provider_type: editing.provider_type,
                color: editing.color,
              }
            : null
        }
      />
      <QrConnectDialog
        channelId={qrChannelId}
        open={!!qrChannelId}
        onOpenChange={(v) => !v && setQrChannelId(null)}
      />
      <MobileChannelDetailSheet
        channelId={detailId}
        open={!!detailId}
        onOpenChange={(v) => !v && setDetailId(null)}
      />
      <MobileChannelActionsSheet
        channel={actionsFor}
        open={!!actionsFor}
        onOpenChange={(v) => !v && setActionsFor(null)}
        onEdit={() => {
          setEditing(actionsFor);
          setOpenForm(true);
        }}
        onConnect={() => setQrChannelId(actionsFor?.id ?? null)}
        onOpenDetail={() => setDetailId(actionsFor?.id ?? null)}
        onDelete={() => setConfirmDelete(actionsFor?.id ?? null)}
      />
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir canal?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as conversas e mensagens vinculadas serão perdidas. Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await del({ data: { id: confirmDelete } });
                  toast.success("Canal excluído");
                  qc.invalidateQueries({ queryKey: ["channels"] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
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

function ChannelCard({
  ch,
  onOpen,
  onActions,
  onConnect,
}: {
  ch: ChannelRow;
  onOpen: () => void;
  onActions: () => void;
  onConnect: () => void;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm active:bg-muted/30">
      {/* Avatar + status */}
      <button
        type="button"
        onClick={onOpen}
        className="relative shrink-0 rounded-2xl focus:outline-none"
        aria-label={`Abrir ${ch.name}`}
      >
        {ch.avatar_url ? (
          <img
            src={ch.avatar_url}
            alt=""
            className="h-12 w-12 rounded-2xl object-cover"
          />
        ) : (
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl text-lg font-bold text-white"
            style={{ backgroundColor: ch.color ?? "#22c55e" }}
          >
            {ch.name?.[0]?.toUpperCase()}
          </div>
        )}
        <span
          className={`absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-card ${
            ch.paused_at
              ? "bg-warning"
              : ch.status === "connected"
                ? "bg-success"
                : ch.status === "connecting"
                  ? "bg-warning animate-pulse"
                  : "bg-muted-foreground"
          }`}
        />
      </button>

      {/* Text */}
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 text-left focus:outline-none"
      >
        <p className="truncate text-[15px] font-semibold">{ch.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {ch.phone_number ?? "sem número"}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <ChannelStatusBadge status={ch.status} paused={!!ch.paused_at} />
          <span className="text-[11px] text-muted-foreground">
            · {ch.messages_24h ?? 0} msgs 24h
          </span>
        </div>
      </button>

      {/* Trailing: sparkline / connect / more */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={onActions}
          aria-label="Ações"
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground active:bg-muted"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {ch.status !== "connected" ? (
          <Button
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={onConnect}
          >
            <QrCode className="mr-1 h-3.5 w-3.5" /> Conectar
          </Button>
        ) : (
          <div className="w-20">
            <Sparkline data={ch.spark} color={ch.color ?? "hsl(var(--primary))"} />
          </div>
        )}
      </div>
    </div>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "success" | "primary" | "warning" | "muted";
}) {
  const toneClass = {
    success: "text-success bg-success/10",
    primary: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/10",
    muted: "text-muted-foreground bg-muted",
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
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  archived,
  hasFilter,
  onCreate,
}: {
  archived: boolean;
  hasFilter: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-dashed border-border/60 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
        <QrCode className="h-6 w-6 text-primary" />
      </div>
      <p className="font-semibold">
        {archived
          ? "Nenhum canal arquivado"
          : hasFilter
            ? "Nenhum resultado"
            : "Nenhum canal ainda"}
      </p>
      <p className="text-sm text-muted-foreground">
        {archived
          ? "Canais arquivados aparecerão aqui."
          : hasFilter
            ? "Ajuste a busca ou o filtro de status."
            : "Crie o primeiro canal para começar a receber mensagens."}
      </p>
      {!archived && !hasFilter && (
        <Button onClick={onCreate} className="mt-2">
          <Plus className="mr-1 h-4 w-4" /> Criar canal
        </Button>
      )}
    </div>
  );
}
