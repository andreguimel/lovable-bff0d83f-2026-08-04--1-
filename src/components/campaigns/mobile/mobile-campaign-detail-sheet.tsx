import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";
import { getBroadcast } from "@/lib/broadcasts.functions";
import { BroadcastStatusBadge } from "../status-badge";

interface Props {
  id: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Tab = "overview" | "stats" | "audience" | "message";

const recipStatus: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  sending: { label: "Enviando", cls: "bg-info/15 text-info" },
  sent: { label: "Enviada", cls: "bg-success/15 text-success" },
  delivered: { label: "Entregue", cls: "bg-success/15 text-success" },
  read: { label: "Lida", cls: "bg-primary/15 text-primary" },
  failed: { label: "Falhou", cls: "bg-destructive/15 text-destructive" },
};

/**
 * Mobile-native campaign detail — bottom sheet 92dvh, scrollable segmented
 * tabs, single scroll axis. Reuses `getBroadcast` server fn (same query
 * key + realtime refetch as desktop).
 */
export function MobileCampaignDetailSheet({ id, open, onOpenChange }: Props) {
  const getFn = useServerFn(getBroadcast);
  const [tab, setTab] = useState<Tab>("overview");

  const q = useQuery({
    queryKey: ["broadcast", id],
    queryFn: () => getFn({ data: { id: id! } }),
    enabled: !!id && open,
    refetchInterval: (query) => {
      const status = query.state.data?.broadcast?.status;
      return status === "sending" ? 2000 : false;
    },
  });

  const b = q.data?.broadcast;
  const recipients = q.data?.recipients ?? [];
  const pct = b?.total_recipients
    ? Math.round((b.sent_count / b.total_recipients) * 100)
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[92dvh] flex-col rounded-t-3xl p-0"
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 pb-3 pt-4 text-left">
          <SheetTitle className="truncate text-base">
            {b?.name ?? "Carregando…"}
          </SheetTitle>
          {b && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <BroadcastStatusBadge status={b.status} />
              {b.channel?.name && (
                <Badge variant="outline" className="text-[11px]">
                  {b.channel.name}
                </Badge>
              )}
              {b.started_at && (
                <span className="text-[11px] text-muted-foreground">
                  Iniciada <ClientTime iso={b.started_at} />
                </span>
              )}
            </div>
          )}

          <div className="-mx-4 mt-3 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-1">
              {(
                [
                  ["overview", "Resumo"],
                  ["stats", "Estatísticas"],
                  ["audience", "Público"],
                  ["message", "Mensagem"],
                ] as Array<[Tab, string]>
              ).map(([tid, label]) => (
                <button
                  key={tid}
                  type="button"
                  onClick={() => setTab(tid)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    tab === tid
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {!b ? (
            <div className="flex h-full items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tab === "overview" ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/60 p-4">
                <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                  <span>Progresso</span>
                  <span>
                    {pct}% ({(b.sent_count ?? 0).toLocaleString("pt-BR")}/
                    {(b.total_recipients ?? 0).toLocaleString("pt-BR")})
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Enviadas" value={b.sent_count ?? 0} />
                <Stat label="Entregues" value={b.delivered_count ?? 0} />
                <Stat label="Lidas" value={b.read_count ?? 0} />
                <Stat
                  label="Falhas"
                  value={b.failed_count ?? 0}
                  tone={(b.failed_count ?? 0) > 0 ? "danger" : undefined}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="Ritmo"
                  value={`${b.rate_per_minute ?? 30}/min`}
                />
                <Stat
                  label="Total público"
                  value={b.total_recipients ?? 0}
                />
              </div>
              {b.scheduled_at && (
                <div className="rounded-2xl border border-border/60 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Agendada para
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    <ClientTime iso={b.scheduled_at} />
                  </p>
                </div>
              )}
            </div>
          ) : tab === "stats" ? (
            <StatsTab
              sent={b.sent_count ?? 0}
              delivered={b.delivered_count ?? 0}
              read={b.read_count ?? 0}
              failed={b.failed_count ?? 0}
              total={b.total_recipients ?? 0}
            />
          ) : tab === "audience" ? (
            <AudienceTab recipients={recipients} />
          ) : (
            <div className="space-y-3">
              <div className="whitespace-pre-wrap rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm">
                {b.message_body || (
                  <span className="text-muted-foreground">(sem conteúdo)</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Ritmo configurado: {b.rate_per_minute ?? 30} msgs/min
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatsTab({
  sent,
  delivered,
  read,
  failed,
  total,
}: {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  total: number;
}) {
  const pct = (v: number, base: number) =>
    base ? Math.round((v / base) * 100) : 0;
  return (
    <div className="space-y-3">
      <Bar label="Entrega" value={delivered} base={sent} tone="success" />
      <Bar label="Leitura" value={read} base={sent} tone="primary" />
      <Bar
        label="Falhas"
        value={failed}
        base={total}
        tone="destructive"
        percent={pct(failed, total)}
      />
      <div className="rounded-2xl border border-border/60 p-4 text-xs text-muted-foreground">
        Métricas calculadas em tempo real a partir dos destinatários. Refetch
        automático a cada 2s enquanto a campanha estiver em envio.
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  base,
  tone,
  percent,
}: {
  label: string;
  value: number;
  base: number;
  tone: "success" | "primary" | "destructive";
  percent?: number;
}) {
  const p = percent ?? (base ? Math.round((value / base) * 100) : 0);
  const track =
    tone === "success"
      ? "bg-success"
      : tone === "primary"
        ? "bg-primary"
        : "bg-destructive";
  return (
    <div className="rounded-2xl border border-border/60 p-3">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value.toLocaleString("pt-BR")} · {p}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${track} transition-all`}
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </div>
    </div>
  );
}

function AudienceTab({
  recipients,
}: {
  recipients: NonNullable<Awaited<ReturnType<typeof getBroadcast>>>["recipients"];
}) {
  if (recipients.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
        Sem destinatários ainda.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/60 rounded-2xl border border-border/60">
      {recipients.map((r) => (
        <li key={r.id} className="p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {r.contact?.name ?? "—"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {r.contact?.phone}
              </p>
              {r.error && (
                <p className="mt-0.5 truncate text-xs text-destructive">
                  {r.error}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge className={`${recipStatus[r.status]?.cls ?? ""} text-[10px]`}>
                {recipStatus[r.status]?.label ?? r.status}
              </Badge>
              {r.sent_at && (
                <span className="text-[10px] text-muted-foreground">
                  <ClientTime iso={r.sent_at} />
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-2xl border border-border/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-lg font-bold tabular-nums ${
          tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </p>
    </div>
  );
}
