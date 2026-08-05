import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft, Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listActiveFlows,
  listTransferTargets,
  previewFlowMessages,
  transferConversation,
} from "@/lib/transfers.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  currentChannelName?: string | null;
}

export function TransferDialog({ open, onOpenChange, conversationId, currentChannelName }: Props) {
  const qc = useQueryClient();
  const listTargets = useServerFn(listTransferTargets);
  const listFlows = useServerFn(listActiveFlows);
  const transfer = useServerFn(transferConversation);

  const targets = useQuery({
    queryKey: ["transfer-targets", conversationId],
    queryFn: () => listTargets({ data: { conversationId } }),
    enabled: open,
  });
  const flows = useQuery({
    queryKey: ["flows-active"],
    queryFn: () => listFlows(),
    enabled: open,
  });

  const [toChannelId, setToChannelId] = useState<string>("");
  const [flowId, setFlowId] = useState<string>("__auto");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) {
      setToChannelId("");
      setFlowId("__auto");
      setNote("");
    }
  }, [open]);

  const selectedChannel = useMemo(
    () => (targets.data?.channels ?? []).find((c) => c.id === toChannelId) ?? null,
    [targets.data, toChannelId],
  );

  // When channel changes, if it has a default welcome flow and user hasn't picked one, keep auto
  useEffect(() => {
    setFlowId("__auto");
  }, [toChannelId]);

  const m = useMutation({
    mutationFn: () =>
      transfer({
        data: {
          conversationId,
          toChannelId,
          flowId: flowId === "__auto" ? undefined : flowId === "__none" ? null : flowId,
          note: note || null,
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["conversation"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["contact-timeline"] });
      if (r.fromChannelId) qc.invalidateQueries({ queryKey: ["conversations", r.fromChannelId] });
      if (r.toChannelId) qc.invalidateQueries({ queryKey: ["conversations", r.toChannelId] });
      toast.success(
        r.messagesSent > 0
          ? `Transferido — fluxo enviou ${r.messagesSent} mensagem(ns)`
          : "Conversa transferida",
      );
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultFlow = selectedChannel?.default_welcome_flow_id
    ? (flows.data ?? []).find((f) => f.id === selectedChannel.default_welcome_flow_id) ?? null
    : null;

  const effectiveFlowId =
    flowId === "__auto"
      ? selectedChannel?.default_welcome_flow_id ?? null
      : flowId === "__none"
        ? null
        : flowId;

  const previewFn = useServerFn(previewFlowMessages);
  const preview = useQuery({
    queryKey: ["flow-preview", effectiveFlowId],
    queryFn: () => previewFn({ data: { flowId: effectiveFlowId as string } }),
    enabled: open && !!effectiveFlowId,
  });

  const noChannels = !targets.isLoading && (targets.data?.channels ?? []).length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Transferir conversa
          </DialogTitle>
          <DialogDescription>
            Mova esta conversa para outro número de WhatsApp e opcionalmente dispare um fluxo de
            boas-vindas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Canal atual: <span className="font-medium text-foreground">{currentChannelName ?? "—"}</span>
          </div>

          {noChannels ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm">
              <p className="text-muted-foreground">Nenhum outro canal cadastrado.</p>
              <Button asChild variant="link" size="sm" className="mt-1">
                <Link to="/channels" onClick={() => onOpenChange(false)}>
                  Cadastrar novo número →
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Canal de destino</Label>
                <Select value={toChannelId} onValueChange={setToChannelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um número" />
                  </SelectTrigger>
                  <SelectContent>
                    {(targets.data?.channels ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id} disabled={!!c.paused_at}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: c.color ?? "#22c55e" }}
                          />
                          <span>{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.phone_number ?? "sem número"}
                          </span>
                          {c.status !== "connected" && (
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              {c.status}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fluxo de boas-vindas</Label>
                <Select value={flowId} onValueChange={setFlowId} disabled={!toChannelId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto">
                      {defaultFlow
                        ? `Padrão do canal — ${defaultFlow.name}`
                        : "Padrão do canal (nenhum configurado)"}
                    </SelectItem>
                    <SelectItem value="__none">Não disparar fluxo</SelectItem>
                    {(flows.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                        {f.status !== "active" && (
                          <span className="ml-2 text-[10px] text-muted-foreground">({f.status})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {effectiveFlowId && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                      <Bot className="h-3 w-3" /> Prévia das mensagens
                    </div>
                    {preview.isLoading ? (
                      <p className="text-xs text-muted-foreground">Carregando…</p>
                    ) : (preview.data?.previews ?? []).length === 0 ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Fluxo sem mensagens configuradas — nada será enviado.
                      </p>
                    ) : (
                      <ol className="space-y-1.5">
                        {preview.data!.previews.map((body, i) => (
                          <li key={i} className="text-xs text-foreground/80">
                            <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                            <span className="line-clamp-2 whitespace-pre-wrap">{body}</span>
                          </li>
                        ))}
                        {preview.data!.hasMore && (
                          <li className="text-[10px] text-muted-foreground">+ mais mensagens…</li>
                        )}
                      </ol>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  O novo número enviará automaticamente as mensagens do fluxo ao cliente.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Nota interna (opcional)</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Motivo da transferência…"
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => m.mutate()} disabled={!toChannelId || m.isPending || noChannels}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
