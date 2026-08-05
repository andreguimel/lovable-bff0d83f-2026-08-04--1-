import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClientTime } from "@/components/client-time";
import { BroadcastStatusBadge } from "@/components/campaigns/status-badge";
import { TransmissionDialog } from "@/components/campaigns/transmission-dialog";
import { CampaignDetailDrawer } from "@/components/campaigns/campaign-detail-drawer";
import { listBroadcasts, sendBroadcastBatch } from "@/lib/broadcasts.functions";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "live", label: "Ativas e Agendadas" },
  { key: "drafts", label: "Rascunhos" },
  { key: "history", label: "Histórico" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function TransmissionsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBroadcasts);
  const batchFn = useServerFn(sendBroadcastBatch);
  const [tab, setTab] = useState<TabKey>("live");
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["broadcasts"], queryFn: () => listFn() });

  const tick = useMutation({
    mutationFn: (id: string) => batchFn({ data: { id, max: 50 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = (q.data ?? []) as any[];
    if (tab === "drafts") return all.filter((r) => r.status === "draft");
    if (tab === "live") return all.filter((r) => ["scheduled", "sending", "paused"].includes(r.status));
    return all.filter((r) => ["completed", "cancelled", "failed"].includes(r.status));
  }, [q.data, tab]);

  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Transmissão</h2>
          </div>
          <Button onClick={() => setOpen(true)}>
            Criar Nova Transmissão <Plus className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-6 border-b">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px border-b-2 px-1 pb-2 text-sm transition",
                tab === t.key
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma transmissão nesta aba.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Fluxo</TableHead>
                  <TableHead>Agendar para</TableHead>
                  <TableHead className="text-right">Enviado</TableHead>
                  <TableHead className="text-right">Falha</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(r.id)}
                  >
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      {r.flow?.name ? (
                        <Badge variant="secondary">{r.flow.name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Mensagem simples</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.scheduled_at ? <ClientTime iso={r.scheduled_at} /> : "—"}
                    </TableCell>
                    <TableCell className="text-right">{(r.sent_count ?? 0).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {(r.failed_count ?? 0).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right"><BroadcastStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {r.status === "sending" && (
                        <Button
                          size="sm" variant="outline"
                          onClick={() => tick.mutate(r.id)}
                          disabled={tick.isPending}
                        >
                          Processar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <TransmissionDialog open={open} onOpenChange={setOpen} />
      <CampaignDetailDrawer id={detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </Card>
  );
}
