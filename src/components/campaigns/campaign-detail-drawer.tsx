import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pause, Play, Send, Trash2, X } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";
import {
  getBroadcast,
  pauseBroadcast,
  resumeBroadcast,
  cancelBroadcast,
  sendBroadcastBatch,
  deleteBroadcast,
} from "@/lib/broadcasts.functions";
import { BroadcastStatusBadge } from "./status-badge";

interface Props {
  id: string | null;
  onOpenChange: (v: boolean) => void;
}

const recipStatus: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  sending: { label: "Enviando", cls: "bg-info/15 text-info" },
  sent: { label: "Enviada", cls: "bg-success/15 text-success" },
  delivered: { label: "Entregue", cls: "bg-success/15 text-success" },
  read: { label: "Lida", cls: "bg-primary/15 text-primary" },
  failed: { label: "Falhou", cls: "bg-destructive/15 text-destructive" },
};

export function CampaignDetailDrawer({ id, onOpenChange }: Props) {
  const qc = useQueryClient();
  const getFn = useServerFn(getBroadcast);
  const pauseFn = useServerFn(pauseBroadcast);
  const resumeFn = useServerFn(resumeBroadcast);
  const cancelFn = useServerFn(cancelBroadcast);
  const batchFn = useServerFn(sendBroadcastBatch);
  const delFn = useServerFn(deleteBroadcast);

  const q = useQuery({
    queryKey: ["broadcast", id],
    queryFn: () => getFn({ data: { id: id! } }),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.broadcast?.status;
      return status === "sending" ? 2000 : false;
    },
  });

  const act = useMutation({
    mutationFn: async (action: "pause" | "resume" | "cancel" | "tick" | "delete") => {
      if (!id) return;
      if (action === "pause") return pauseFn({ data: { id } });
      if (action === "resume") return resumeFn({ data: { id } });
      if (action === "cancel") return cancelFn({ data: { id } });
      if (action === "tick") return batchFn({ data: { id, max: 50 } });
      if (action === "delete") return delFn({ data: { id } });
    },
    onSuccess: (_r, action) => {
      qc.invalidateQueries({ queryKey: ["broadcast", id] });
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      if (action === "delete") { toast.success("Campanha excluída"); onOpenChange(false); }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const b = q.data?.broadcast;
  const recipients = q.data?.recipients ?? [];
  const pct = b?.total_recipients ? Math.round((b.sent_count / b.total_recipients) * 100) : 0;

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate">{b?.name ?? "Carregando..."}</SheetTitle>
              {b && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <BroadcastStatusBadge status={b.status} />
                  {b.channel && <Badge variant="outline">{b.channel.name}</Badge>}
                  {b.started_at && (
                    <span className="text-xs text-muted-foreground">
                      Iniciada <ClientTime iso={b.started_at} />
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </SheetHeader>

        {b && (
          <div className="flex flex-col gap-4 py-4">
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                <span>Progresso</span>
                <span>{pct}% ({b.sent_count.toLocaleString("pt-BR")}/{b.total_recipients.toLocaleString("pt-BR")})</span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <Metric label="Enviadas" value={b.sent_count} />
                <Metric label="Entregues" value={b.delivered_count} />
                <Metric label="Lidas" value={b.read_count} />
                <Metric label="Falhas" value={b.failed_count} tone="danger" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {b.status === "sending" && (
                <>
                  <Button size="sm" onClick={() => act.mutate("tick")} disabled={act.isPending}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Processar lote
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act.mutate("pause")}>
                    <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
                  </Button>
                </>
              )}
              {b.status === "paused" && (
                <Button size="sm" onClick={() => act.mutate("resume")}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Retomar
                </Button>
              )}
              {["sending", "paused", "scheduled"].includes(b.status) && (
                <Button size="sm" variant="outline" onClick={() => act.mutate("cancel")}>
                  <X className="mr-1 h-3.5 w-3.5" /> Cancelar
                </Button>
              )}
              {["draft", "completed", "cancelled", "failed"].includes(b.status) && (
                <Button size="sm" variant="outline" onClick={() => act.mutate("delete")}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                </Button>
              )}
            </div>

            <Tabs defaultValue="message">
              <TabsList>
                <TabsTrigger value="message">Mensagem</TabsTrigger>
                <TabsTrigger value="recipients">Destinatários ({recipients.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="message" className="mt-3">
                <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">
                  {b.message_body || <span className="text-muted-foreground">(vazio)</span>}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Ritmo: {b.rate_per_minute}/min</p>
              </TabsContent>
              <TabsContent value="recipients" className="mt-3">
                <div className="divide-y rounded-lg border">
                  {recipients.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">Sem destinatários ainda.</p>
                  )}
                  {recipients.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.contact?.name ?? "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.contact?.phone}</p>
                        {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {r.sent_at && (
                          <span className="text-xs text-muted-foreground">
                            <ClientTime iso={r.sent_at} />
                          </span>
                        )}
                        <Badge className={recipStatus[r.status]?.cls}>{recipStatus[r.status]?.label ?? r.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-lg bg-muted/60 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
