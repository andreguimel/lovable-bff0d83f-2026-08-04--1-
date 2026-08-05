import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, QrCode, Search, Settings, Pause, Play, Archive, Trash2, MoreVertical, Zap, MessageSquare, Activity, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listChannels, archiveChannel, deleteChannel, setChannelPaused, disconnectChannel, syncStevoChannel,
} from "@/lib/channels.functions";
import { useRealtimeChannels } from "@/hooks/use-realtime-channels";
import { useStevoStatusSync } from "@/hooks/use-stevo-status-sync";
import { ChannelStatusBadge } from "@/components/channels/channel-status-badge";
import { Sparkline } from "@/components/channels/sparkline";
import { ChannelFormSheet } from "@/components/channels/channel-form-sheet";
import { QrConnectDialog } from "@/components/channels/qr-connect-dialog";
import { ChannelDetailDrawer } from "@/components/channels/channel-detail-drawer";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileChannelsHome } from "@/components/channels/mobile/mobile-channels-home";

export const Route = createFileRoute("/_authenticated/channels")({
  head: () => ({ meta: [{ title: "Canais — Zenda" }] }),
  component: ChannelsRoute,
});

function ChannelsRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileChannelsHome /> : <ChannelsPage />;
}

type ChannelRow = Awaited<ReturnType<typeof listChannels>>[number];

function ChannelsPage() {
  useRealtimeChannels();
  useStevoStatusSync();
  const qc = useQueryClient();
  const list = useServerFn(listChannels);
  const archive = useServerFn(archiveChannel);
  const del = useServerFn(deleteChannel);
  const pause = useServerFn(setChannelPaused);
  const disconnect = useServerFn(disconnectChannel);
  const syncStevo = useServerFn(syncStevoChannel);

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [qrChannelId, setQrChannelId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
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

  const rows = (channels.data ?? []).filter((c) => {
    if (showArchived ? !c.archived_at : !!c.archived_at) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (providerFilter !== "all" && c.provider_type !== providerFilter) return false;
    if (search && !`${c.name} ${c.phone_number ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totals = {
    active: rows.filter((r) => r.status === "connected" && !r.paused_at).length,
    msgs24: rows.reduce((s, r) => s + (r.messages_24h ?? 0), 0),
    connecting: rows.filter((r) => r.status === "connecting").length,
    paused: rows.filter((r) => r.paused_at).length,
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["channels"] });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Canais de WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Hub de números com ciclo completo, métricas ao vivo e roteamento inteligente.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpenForm(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Novo canal
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi icon={<Zap className="h-4 w-4" />} label="Ativos" value={totals.active} tone="success" />
        <Kpi icon={<MessageSquare className="h-4 w-4" />} label="Msgs 24h" value={totals.msgs24} tone="primary" />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Conectando" value={totals.connecting} tone="warning" />
        <Kpi icon={<Pause className="h-4 w-4" />} label="Pausados" value={totals.paused} tone="muted" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar canal ou número..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="connected">Conectados</SelectItem>
            <SelectItem value="connecting">Conectando</SelectItem>
            <SelectItem value="disconnected">Offline</SelectItem>
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos providers</SelectItem>
            <SelectItem value="whatsapp_cloud">Cloud API</SelectItem>
            <SelectItem value="whatsapp_business">Business</SelectItem>
            <SelectItem value="baileys">Baileys</SelectItem>
            <SelectItem value="evolution">Evolution</SelectItem>
            <SelectItem value="stevo">Stevo</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
          <Archive className="mr-1 h-4 w-4" /> Arquivados
        </Button>
      </div>

      {channels.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5 h-40 animate-pulse bg-muted/30" /></Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <QrCode className="h-8 w-8 text-primary" />
          </div>
          <p className="mb-1 font-semibold">Nenhum canal {showArchived ? "arquivado" : "conectado"}</p>
          <p className="mb-4 text-sm text-muted-foreground">
            {showArchived ? "Você não arquivou nenhum canal ainda." : "Crie seu primeiro canal para começar a receber mensagens."}
          </p>
          {!showArchived && (
            <Button onClick={() => { setEditing(null); setOpenForm(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Criar canal
            </Button>
          )}
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((ch) => (
            <Card key={ch.id} className="group transition hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    {ch.avatar_url ? (
                      <img src={ch.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                    ) : (
                      <div
                        className="h-14 w-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
                        style={{ backgroundColor: ch.color ?? "#22c55e" }}
                      >
                        {ch.name?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <span
                      className={`absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-card ${
                        ch.paused_at ? "bg-warning" :
                        ch.status === "connected" ? "bg-success" :
                        ch.status === "connecting" ? "bg-warning animate-pulse" : "bg-muted-foreground"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setDetailId(ch.id)}
                      className="text-left"
                    >
                      <p className="font-semibold truncate hover:text-primary">{ch.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{ch.phone_number ?? "sem número"}</p>
                    </button>
                    <div className="mt-1 flex items-center gap-2">
                      <ChannelStatusBadge status={ch.status} paused={!!ch.paused_at} />
                      <Badge variant="outline" className="text-[10px]">{providerLabel(ch.provider_type)}</Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetailId(ch.id)}>
                        <Settings className="mr-2 h-4 w-4" /> Detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditing(ch); setOpenForm(true); }}>
                        Editar
                      </DropdownMenuItem>
                      {ch.status !== "connected" ? (
                        <DropdownMenuItem onClick={() => setQrChannelId(ch.id)}>
                          <QrCode className="mr-2 h-4 w-4" /> Conectar
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={async () => {
                          await disconnect({ data: { id: ch.id } }); invalidate(); toast.success("Desconectado");
                        }}>
                          Desconectar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={async () => {
                        await pause({ data: { id: ch.id, paused: !ch.paused_at } }); invalidate();
                        toast.success(ch.paused_at ? "Retomado" : "Pausado");
                      }}>
                        {ch.paused_at ? <><Play className="mr-2 h-4 w-4" /> Retomar</> : <><Pause className="mr-2 h-4 w-4" /> Pausar</>}
                      </DropdownMenuItem>
                      {ch.provider_type === "stevo" && (
                        <DropdownMenuItem onClick={async () => {
                          const res = await syncStevo({ data: { id: ch.id } });
                          invalidate();
                          if (res.ok) toast.success(res.message);
                          else toast.error(res.message);
                        }}>
                          <RefreshCw className="mr-2 h-4 w-4" /> Sincronizar Stevo
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={async () => {
                        await archive({ data: { id: ch.id, archived: !ch.archived_at } }); invalidate();
                        toast.success(ch.archived_at ? "Restaurado" : "Arquivado");
                      }}>
                        <Archive className="mr-2 h-4 w-4" /> {ch.archived_at ? "Restaurar" : "Arquivar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setConfirmDelete(ch.id)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{ch.messages_24h ?? 0}</p>
                    <p className="text-xs text-muted-foreground">msgs 24h</p>
                  </div>
                  <div className="flex-1 max-w-[140px]">
                    <Sparkline data={ch.spark} color={ch.color ?? "hsl(var(--primary))"} />
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  {ch.status !== "connected" ? (
                    <Button size="sm" className="flex-1" onClick={() => setQrChannelId(ch.id)}>
                      <QrCode className="mr-1 h-4 w-4" /> Conectar
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetailId(ch.id)}>
                      <Settings className="mr-1 h-4 w-4" /> Gerenciar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ChannelFormSheet
        open={openForm}
        onOpenChange={setOpenForm}
        existing={editing ? {
          id: editing.id, name: editing.name, phone_number: editing.phone_number,
          provider_type: editing.provider_type, color: editing.color,
        } : null}
      />
      <QrConnectDialog channelId={qrChannelId} open={!!qrChannelId} onOpenChange={(v) => !v && setQrChannelId(null)} />
      <ChannelDetailDrawer channelId={detailId} open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir canal?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as conversas e mensagens vinculadas serão perdidas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                await del({ data: { id: confirmDelete } });
                setConfirmDelete(null);
                invalidate();
                toast.success("Canal excluído");
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

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "success" | "primary" | "warning" | "muted" }) {
  const toneClass = {
    success: "bg-success/10 text-success",
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${toneClass}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
        </div>
      </div>
    </CardContent></Card>
  );
}

function providerLabel(p: string | null) {
  return {
    whatsapp_cloud: "Cloud API",
    whatsapp_business: "Business",
    baileys: "Baileys",
    evolution: "Evolution",
    stevo: "Stevo",
  }[p ?? "whatsapp_cloud"] ?? p ?? "—";
}
