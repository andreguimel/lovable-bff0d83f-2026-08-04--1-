import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Play, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClientTime } from "@/components/client-time";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { CampaignDetailDrawer } from "@/components/campaigns/campaign-detail-drawer";
import { BroadcastStatusBadge } from "@/components/campaigns/status-badge";
import { useRealtimeBroadcasts } from "@/hooks/use-realtime-broadcasts";
import { listBroadcasts, duplicateBroadcast, sendBroadcastBatch } from "@/lib/broadcasts.functions";
import { useMobileFab } from "@/components/mobile/mobile-fab";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCampaignsHome } from "@/components/campaigns/mobile/mobile-campaigns-home";
import { TransmissionsSection } from "@/components/campaigns/transmissions-section";
import { TransmissionDialog } from "@/components/campaigns/transmission-dialog";


export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Campanhas · Zenda" },
      { name: "description", content: "Dispare campanhas em massa via WhatsApp com segmentação, agendamento e métricas em tempo real." },
      { property: "og:title", content: "Campanhas · Zenda" },
      { property: "og:description", content: "Broadcasts inteligentes para WhatsApp." },
    ],
  }),
  component: CampaignsRoute,
});

function CampaignsRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileCampaignsHome /> : <CampaignsPage />;
}

function CampaignsPage() {
  useRealtimeBroadcasts();
  const qc = useQueryClient();
  const listFn = useServerFn(listBroadcasts);
  const dupFn = useServerFn(duplicateBroadcast);
  const batchFn = useServerFn(sendBroadcastBatch);

  const [filter, setFilter] = useState<string>("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [transmissionOpen, setTransmissionOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { setAction } = useMobileFab();
  useEffect(() => {
    setAction({ label: "Nova campanha", icon: Plus, onClick: () => setWizardOpen(true) });
    return () => setAction(null);
  }, [setAction]);


  const q = useQuery({ queryKey: ["broadcasts"], queryFn: () => listFn() });

  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["broadcasts"] }); toast.success("Campanha duplicada"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const tick = useMutation({
    mutationFn: (id: string) => batchFn({ data: { id, max: 50 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const list = useMemo(() => {
    const rows = q.data ?? [];
    if (filter === "all") return rows;
    return rows.filter((r: any) => r.status === filter);
  }, [q.data, filter]);

  const kpis = useMemo(() => {
    const rows = q.data ?? [];
    return {
      active: rows.filter((r: any) => r.status === "sending" || r.status === "scheduled").length,
      sent: rows.reduce((s: number, r: any) => s + (r.sent_count ?? 0), 0),
      delivered: rows.reduce((s: number, r: any) => s + (r.delivered_count ?? 0), 0),
      read: rows.reduce((s: number, r: any) => s + (r.read_count ?? 0), 0),
    };
  }, [q.data]);

  const deliveryRate = kpis.sent ? Math.round((kpis.delivered / kpis.sent) * 100) : 0;
  const readRate = kpis.sent ? Math.round((kpis.read / kpis.sent) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Disparos em massa com segmentação e agendamento inteligente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova campanha
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTransmissionOpen(true)}>
            Criar Nova Transmissão <Plus className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>


      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Ativas" value={kpis.active} />
        <Kpi label="Enviadas" value={kpis.sent} />
        <Kpi label="Taxa entrega" value={`${deliveryRate}%`} />
        <Kpi label="Taxa leitura" value={`${readRate}%`} />
      </div>

      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="draft">Rascunhos</SelectItem>
            <SelectItem value="scheduled">Agendadas</SelectItem>
            <SelectItem value="sending">Em envio</SelectItem>
            <SelectItem value="paused">Pausadas</SelectItem>
            <SelectItem value="completed">Concluídas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : list.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma campanha por aqui. Clique em <b>Nova campanha</b> para começar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((c: any) => {
            const pct = c.total_recipients ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
            return (
              <Card key={c.id} className="cursor-pointer transition hover:border-primary/40" onClick={() => setDetailId(c.id)}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-base font-semibold">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.channel?.name ? `via ${c.channel.name} · ` : ""}
                        {(c.total_recipients ?? 0).toLocaleString("pt-BR")} contatos
                        {c.scheduled_at && <> · <ClientTime iso={c.scheduled_at} /></>}
                      </p>
                    </div>
                    <BroadcastStatusBadge status={c.status} />
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span><span>{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    <MetricCell label="Enviadas" value={c.sent_count} />
                    <MetricCell label="Entregues" value={c.delivered_count} />
                    <MetricCell label="Lidas" value={c.read_count} />
                    <MetricCell label="Falhas" value={c.failed_count} tone="danger" />
                  </div>

                  <div className="mt-4 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    {c.status === "sending" && (
                      <Button size="sm" variant="outline" onClick={() => tick.mutate(c.id)} disabled={tick.isPending}>
                        <Play className="mr-1 h-3.5 w-3.5" /> Processar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => dup.mutate(c.id)} disabled={dup.isPending}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TransmissionsSection />

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <TransmissionDialog open={transmissionOpen} onOpenChange={setTransmissionOpen} />

      <CampaignDetailDrawer id={detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p>
    </CardContent></Card>
  );
}

function MetricCell({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-lg bg-muted/60 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>
        {(value ?? 0).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
