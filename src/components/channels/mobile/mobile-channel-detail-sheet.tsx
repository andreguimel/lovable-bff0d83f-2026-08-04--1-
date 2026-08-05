import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";
import {
  getChannel,
  sendTestMessage,
  updateChannel,
} from "@/lib/channels.functions";
import { ChannelStatusBadge } from "../channel-status-badge";

interface Props {
  channelId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Tab = "overview" | "config" | "logs" | "test";

const eventLabels: Record<string, string> = {
  connected: "Conectado",
  disconnected: "Desconectado",
  qr_generated: "QR gerado",
  error: "Erro",
  message_sent: "Msg enviada",
  message_received: "Msg recebida",
  rate_limited: "Rate limit",
  paused: "Pausado",
  resumed: "Retomado",
  test_sent: "Teste enviado",
};

/**
 * Mobile-native channel detail — bottom sheet that fills 92dvh, with a
 * scrollable segmented control instead of a cramped grid of tabs. Reuses
 * getChannel / updateChannel / sendTestMessage server functions.
 */
export function MobileChannelDetailSheet({ channelId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const getCh = useServerFn(getChannel);
  const update = useServerFn(updateChannel);
  const test = useServerFn(sendTestMessage);

  const [tab, setTab] = useState<Tab>("overview");

  const detail = useQuery({
    queryKey: ["channel", channelId],
    queryFn: () => getCh({ data: { id: channelId! } }),
    enabled: !!channelId && open,
  });

  const ch = detail.data?.channel;

  const patch = useMutation({
    mutationFn: (p: Record<string, unknown>) =>
      update({ data: { id: channelId!, patch: p } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [testPhone, setTestPhone] = useState("");
  const [testBody, setTestBody] = useState(
    "Olá, essa é uma mensagem de teste do Zenda 🚀",
  );
  const testMut = useMutation({
    mutationFn: () =>
      test({ data: { id: channelId!, phone: testPhone, body: testBody } }),
    onSuccess: () => {
      toast.success("Teste enviado");
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[92dvh] flex-col rounded-t-3xl p-0"
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 pb-3 pt-4 text-left">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
            {ch && (
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-base font-bold text-white"
                style={{ backgroundColor: ch.color ?? "#22c55e" }}
              >
                {ch.name?.[0]?.toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">
                {ch?.name ?? "Carregando…"}
              </SheetTitle>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                {ch && <ChannelStatusBadge status={ch.status} paused={!!ch.paused_at} />}
                {ch?.phone_number && (
                  <span className="truncate">· {ch.phone_number}</span>
                )}
              </div>
            </div>
          </div>

          {/* Scrollable segmented tabs */}
          <div className="-mx-4 mt-3 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-1">
              {(
                [
                  ["overview", "Resumo"],
                  ["config", "Configuração"],
                  ["logs", "Logs"],
                  ["test", "Teste"],
                ] as Array<[Tab, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    tab === id
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
          {!ch ? (
            <div className="flex h-full items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tab === "overview" ? (
            <OverviewTab detail={detail.data!} />
          ) : tab === "config" ? (
            <ConfigTab
              ch={ch}
              onPatch={(p) => patch.mutate(p)}
              saving={patch.isPending}
            />
          ) : tab === "logs" ? (
            <LogsTab events={detail.data?.events ?? []} />
          ) : (
            <TestTab
              disabled={ch.status !== "connected"}
              phone={testPhone}
              body={testBody}
              onPhone={setTestPhone}
              onBody={setTestBody}
              onSend={() => testMut.mutate()}
              sending={testMut.isPending}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OverviewTab({
  detail,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getChannel>>>;
}) {
  const ch = detail.channel;
  const totalMsgs = (detail.metrics ?? []).reduce(
    (s, m) => s + (m.messages_sent ?? 0) + (m.messages_received ?? 0),
    0,
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Número" value={ch.phone_number ?? "—"} />
        <Stat label="Provider" value={providerLabel(ch.provider_type)} />
        <Stat
          label="Última conexão"
          value={
            ch.last_connected_at ? <ClientTime iso={ch.last_connected_at} /> : "Nunca"
          }
        />
        <Stat label="Limite diário" value={`${ch.daily_message_limit ?? 0}`} />
      </div>
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 to-transparent p-4">
        <p className="text-xs font-medium text-muted-foreground">Mensagens (30 dias)</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{totalMsgs}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Somatório de enviadas + recebidas.
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 p-4">
        <p className="mb-2 text-sm font-medium">Estratégia de roteamento</p>
        <p className="text-sm text-muted-foreground">
          {routingLabel(ch.routing_strategy ?? "round_robin")}
        </p>
      </div>
    </div>
  );
}

function ConfigTab({
  ch,
  onPatch,
  saving,
}: {
  ch: NonNullable<Awaited<ReturnType<typeof getChannel>>>["channel"];
  onPatch: (p: Record<string, unknown>) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-border/60 p-3">
        <div className="min-w-0 pr-3">
          <p className="text-sm font-medium">Resposta automática</p>
          <p className="text-xs text-muted-foreground">
            Enviar mensagem imediata a novos contatos.
          </p>
        </div>
        <Switch
          checked={!!ch.auto_reply_enabled}
          onCheckedChange={(v) => onPatch({ auto_reply_enabled: v })}
        />
      </div>

      <div className="space-y-2">
        <Label>Mensagem fora do expediente</Label>
        <Textarea
          defaultValue={ch.off_hours_message ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (ch.off_hours_message ?? ""))
              onPatch({ off_hours_message: v || null });
          }}
          placeholder="Estamos fora do horário. Retornaremos amanhã às 9h."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Limite diário de mensagens</Label>
        <Input
          type="number"
          inputMode="numeric"
          defaultValue={ch.daily_message_limit ?? 1000}
          onBlur={(e) => {
            const v = parseInt(e.target.value);
            if (v && v !== ch.daily_message_limit)
              onPatch({ daily_message_limit: v });
          }}
        />
      </div>

      <div className="space-y-2">
        <Label>Estratégia de roteamento</Label>
        <div className="grid gap-2">
          {ROUTING.map((r) => {
            const active = ch.routing_strategy === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => onPatch({ routing_strategy: r.value })}
                className={`rounded-2xl border p-3 text-left transition ${
                  active ? "border-primary bg-primary/5" : "border-border/60"
                }`}
              >
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {saving && (
        <p className="text-center text-xs text-muted-foreground">Salvando…</p>
      )}
    </div>
  );
}

function LogsTab({
  events,
}: {
  events: NonNullable<Awaited<ReturnType<typeof getChannel>>>["events"];
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
        Sem eventos registrados ainda.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
      {events.map((e) => (
        <div key={e.id} className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0 flex-1">
            <Badge variant="outline" className="text-[11px]">
              {eventLabels[e.event_type] ?? e.event_type}
            </Badge>
            {e.payload && Object.keys(e.payload as object).length > 0 && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {JSON.stringify(e.payload)}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            <ClientTime iso={e.created_at} />
          </span>
        </div>
      ))}
    </div>
  );
}

function TestTab({
  disabled,
  phone,
  body,
  onPhone,
  onBody,
  onSend,
  sending,
}: {
  disabled: boolean;
  phone: string;
  body: string;
  onPhone: (v: string) => void;
  onBody: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Número de destino</Label>
        <Input
          value={phone}
          onChange={(e) => onPhone(e.target.value)}
          placeholder="+55 11 90000-0000"
          inputMode="tel"
        />
      </div>
      <div className="space-y-2">
        <Label>Mensagem</Label>
        <Textarea value={body} onChange={(e) => onBody(e.target.value)} rows={5} />
      </div>
      <Button
        onClick={onSend}
        disabled={!phone || !body || sending || disabled}
        className="h-12 w-full"
      >
        <Send className="mr-2 h-4 w-4" />
        {sending ? "Enviando…" : "Enviar teste"}
      </Button>
      {disabled && (
        <p className="text-center text-xs text-muted-foreground">
          O canal precisa estar conectado para enviar testes.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

const ROUTING = [
  { value: "round_robin", label: "Round-robin", desc: "Distribui igualmente entre agentes." },
  { value: "least_busy", label: "Menos ocupado", desc: "Envia para quem tem menos conversas." },
  { value: "best_conversion", label: "Melhor conversão", desc: "Prioriza histórico de conversão." },
  { value: "manual", label: "Manual", desc: "Requer atribuição manual." },
];

function providerLabel(p: string | null) {
  return (
    {
      whatsapp_cloud: "Cloud API",
      whatsapp_business: "Business",
      baileys: "Baileys",
      evolution: "Evolution",
      stevo: "Stevo",
    }[p ?? "whatsapp_cloud"] ?? p ?? "—"
  );
}

function routingLabel(r: string) {
  return ROUTING.find((x) => x.value === r)?.label ?? r;
}
