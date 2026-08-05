/**
 * Message Info Sheet — Item 4 · Grupo A · INBOX-UX-01.
 *
 * Read-only side sheet (desktop) / bottom sheet (mobile) that mirrors
 * WhatsApp Web's "Message info" panel using only fields already persisted
 * in the database. Fields that are null are rendered as "Não disponível".
 * No mutations, no fake data.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Bot, Copy, Info, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getMessageInfo } from "@/lib/inbox.functions";

export interface MessageInfoSheetProps {
  messageId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Force mobile bottom-sheet layout. Defaults to false (right side sheet). */
  mobile?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  sending: "Enviando",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lido",
  failed: "Falhou",
  received: "Recebido",
};

const TYPE_LABELS: Record<string, string> = {
  text: "Texto",
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  file: "Arquivo",
  system: "Sistema",
};

const PROVIDER_LABELS: Record<string, string> = {
  whatsapp_cloud: "WhatsApp Cloud (Meta)",
  whatsapp_evolution: "WhatsApp (Evolution)",
  stevo: "Stevo",
  whatsapp_baileys: "WhatsApp (Baileys)",
  instagram: "Instagram",
  telegram: "Telegram",
};

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function unavailable() {
  return <span className="text-muted-foreground italic">Não disponível</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-1.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function CopyableId({ value }: { value: string | null | undefined }) {
  if (!value) return unavailable();
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("ID copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
      title="Copiar"
    >
      <span className="max-w-[220px] truncate">{value}</span>
      <Copy className="h-3 w-3 shrink-0 opacity-60" />
    </button>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return unavailable();
  const label = STATUS_LABELS[status] ?? status;
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "failed"
      ? "destructive"
      : status === "read" || status === "delivered"
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}

export function MessageInfoSheet({
  messageId,
  open,
  onOpenChange,
  mobile = false,
}: MessageInfoSheetProps) {
  const fetchInfo = useServerFn(getMessageInfo);
  const { data, isLoading, error } = useQuery({
    queryKey: ["message-info", messageId],
    queryFn: () => fetchInfo({ data: { messageId: messageId! } }),
    enabled: !!messageId && open,
    staleTime: 30_000,
  });

  const side = mobile ? "bottom" : "right";
  const contentClass = mobile
    ? "rounded-t-3xl border-t border-border/60 max-h-[85vh] overflow-y-auto p-0 pb-[env(safe-area-inset-bottom)]"
    : "w-full sm:max-w-md overflow-y-auto p-0";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={contentClass} aria-label="Informações da mensagem">
        <SheetHeader className="border-b border-border/40 px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <Info className="h-4 w-4 text-muted-foreground" />
            Informações da mensagem
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            Dados reais persistidos no sistema. Campos sem informação aparecem como
            "Não disponível".
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-4">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[13px] text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error instanceof Error ? error.message : "Erro ao carregar"}</span>
            </div>
          )}

          {data && (
            <div className="space-y-5">
              {/* Preview */}
              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Conteúdo
                </h4>
                <div
                  className={cn(
                    "rounded-lg border border-border/60 bg-muted/30 p-3 text-[13px]",
                    data.message.direction === "outbound" ? "border-l-4 border-l-primary/60" : "border-l-4 border-l-emerald-500/60",
                  )}
                >
                  {data.message.type === "text" && data.message.body ? (
                    <p className="whitespace-pre-wrap break-words">{data.message.body}</p>
                  ) : data.message.body ? (
                    <p className="whitespace-pre-wrap break-words">
                      <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {TYPE_LABELS[data.message.type] ?? data.message.type}
                      </span>
                      {data.message.body}
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Sem corpo de texto ({TYPE_LABELS[data.message.type] ?? data.message.type})
                    </p>
                  )}
                </div>
              </section>

              {/* Core fields */}
              <section>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Detalhes
                </h4>
                <Row label="Tipo">{TYPE_LABELS[data.message.type] ?? data.message.type}</Row>
                <Row label="Direção">
                  <Badge variant="outline">
                    {data.message.direction === "outbound" ? "Enviada" : "Recebida"}
                  </Badge>
                </Row>
                <Row label="Status">
                  <StatusBadge status={data.message.status} />
                </Row>
                <Row label="Criada em">{formatDateTime(data.message.created_at) ?? unavailable()}</Row>
                <Row label="Falhou em">
                  {data.message.failed_at ? formatDateTime(data.message.failed_at) : unavailable()}
                </Row>
                <Row label="Tentativas">
                  {typeof data.message.retry_count === "number" ? data.message.retry_count : unavailable()}
                </Row>
                {data.message.error && (
                  <Row label="Erro">
                    <span className="text-destructive">{data.message.error}</span>
                  </Row>
                )}
                {data.message.deleted_at && (
                  <>
                    <Row label="Excluída em">{formatDateTime(data.message.deleted_at)}</Row>
                    <Row label="Escopo">{data.message.deleted_scope ?? unavailable()}</Row>
                    {data.message.deleted_reason && (
                      <Row label="Motivo">{data.message.deleted_reason}</Row>
                    )}
                  </>
                )}
              </section>

              <Separator />

              {/* Channel + provider */}
              <section>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Canal
                </h4>
                <Row label="Canal">{data.channel?.name ?? unavailable()}</Row>
                <Row label="Provider">
                  {data.channel?.provider_type
                    ? (PROVIDER_LABELS[data.channel.provider_type] ?? data.channel.provider_type)
                    : unavailable()}
                </Row>
                <Row label="Número">{data.channel?.phone_number ?? unavailable()}</Row>
              </section>

              <Separator />

              {/* IDs */}
              <section>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Identificadores
                </h4>
                <Row label="message_id"><CopyableId value={data.message.id} /></Row>
                <Row label="provider_message_id">
                  <CopyableId value={data.message.provider_message_id} />
                </Row>
                <Row label="conversation_id">
                  <CopyableId value={data.message.conversation_id} />
                </Row>
                <Row label="reply_to_id">
                  {data.message.reply_to_id ? (
                    <CopyableId value={data.message.reply_to_id} />
                  ) : (
                    unavailable()
                  )}
                </Row>
              </section>

              <Separator />

              {/* Sender */}
              <section>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Responsável
                </h4>
                {data.senderAgent ? (
                  <Row label="Agente IA">
                    <span className="inline-flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                      {data.senderAgent.name ?? data.senderAgent.id}
                      {data.senderAgent.model && (
                        <span className="text-[11px] text-muted-foreground">
                          · {data.senderAgent.model}
                        </span>
                      )}
                    </span>
                  </Row>
                ) : data.senderUser ? (
                  <Row label="Operador">
                    <span className="inline-flex items-center gap-1.5">
                      <UserIcon className="h-3.5 w-3.5" />
                      {data.senderUser.full_name ?? data.senderUser.id}
                    </span>
                  </Row>
                ) : data.message.direction === "inbound" ? (
                  <Row label="Origem">Contato (mensagem recebida)</Row>
                ) : (
                  <Row label="Origem">{unavailable()}</Row>
                )}
              </section>

              {/* Flow origin */}
              {data.flowRun && (
                <>
                  <Separator />
                  <section>
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Fluxo de origem
                    </h4>
                    <Row label="Nome">{data.flowRun.flow_name ?? unavailable()}</Row>
                    <Row label="Status">
                      <Badge variant="secondary">{data.flowRun.status}</Badge>
                    </Row>
                    <Row label="Iniciado em">
                      {formatDateTime(data.flowRun.started_at) ?? unavailable()}
                    </Row>
                    <Row label="Concluído em">
                      {formatDateTime(data.flowRun.completed_at) ?? unavailable()}
                    </Row>
                    <Row label="flow_run_id"><CopyableId value={data.flowRun.id} /></Row>
                  </section>
                </>
              )}

              {/* Timeline */}
              <Separator />
              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Timeline de eventos
                </h4>
                {data.events.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground italic">
                    Nenhum evento registrado para esta mensagem.
                  </p>
                ) : (
                  <ol className="space-y-2 border-l border-border/60 pl-4">
                    {data.events.map((ev) => (
                      <li key={ev.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                        <div className="text-[12px] font-medium">{ev.event_type}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDateTime(ev.created_at)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
