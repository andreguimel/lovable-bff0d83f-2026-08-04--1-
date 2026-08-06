import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";
import { RefreshCw } from "lucide-react";
import {
  getChannel,
  updateChannel,
  sendTestMessage,
  listAiAgentsForChannel,
  listFlowsForChannel,
  testChannelConnection,
  syncStevoChannel,
} from "@/lib/channels.functions";

import { ChannelStatusBadge } from "./channel-status-badge";
import { ChannelRoutingTab } from "./channel-routing-tab";
import { RoutingSummary } from "./channel-routing-summary";

const routingOptions = [
  { value: "round_robin", label: "Round-robin", desc: "Distribui igualmente entre agentes" },
  { value: "least_busy", label: "Menos ocupado", desc: "Envia para quem tem menos conversas abertas" },
  { value: "best_conversion", label: "Melhor conversão", desc: "Prioriza agente com maior histórico de conversão" },
  { value: "manual", label: "Manual", desc: "Requer atribuição manual" },
];

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

interface Props {
  channelId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ChannelDetailDrawer({ channelId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const getCh = useServerFn(getChannel);
  const update = useServerFn(updateChannel);
  const test = useServerFn(sendTestMessage);
  const listAgents = useServerFn(listAiAgentsForChannel);
  const listFlows = useServerFn(listFlowsForChannel);
  const syncStevo = useServerFn(syncStevoChannel);

  const detail = useQuery({
    queryKey: ["channel", channelId],
    queryFn: () => getCh({ data: { id: channelId! } }),
    enabled: !!channelId && open,
  });
  const agents = useQuery({
    queryKey: ["ai-agents-select"],
    queryFn: () => listAgents(),
    enabled: open,
  });
  const flows = useQuery({
    queryKey: ["flows-select"],
    queryFn: () => listFlows(),
    enabled: open,
  });

  const ch = detail.data?.channel;

  const patch = useMutation({
    mutationFn: (p: Record<string, unknown>) => update({ data: { id: channelId!, patch: p } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncStevoMut = useMutation({
    mutationFn: () => syncStevo({ data: { id: channelId! } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [testPhone, setTestPhone] = useState("");
  const [testBody, setTestBody] = useState("Olá, essa é uma mensagem de teste do Zenda 🚀");
  const testMut = useMutation({
    mutationFn: () => test({ data: { id: channelId!, phone: testPhone, body: testBody } }),
    onSuccess: () => {
      toast.success("Teste enviado");
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [eventFilter, setEventFilter] = useState<string>("all");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {ch && (
                <span
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: ch.color ?? "#22c55e" }}
                >
                  {ch.name?.[0]?.toUpperCase()}
                </span>
              )}
              {ch?.name ?? "Canal"}
              {ch && <ChannelStatusBadge status={ch.status} paused={!!ch.paused_at} />}
            </div>
            {ch?.provider_type === "stevo" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncStevoMut.mutate()}
                disabled={syncStevoMut.isPending}
              >
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncStevoMut.isPending ? "animate-spin" : ""}`} />
                Sincronizar Stevo
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        {ch && (
          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="settings">Configurações</TabsTrigger>
              <TabsTrigger value="routing">Roteamento</TabsTrigger>
              <TabsTrigger value="integration">Integração</TabsTrigger>
              <TabsTrigger value="events">Eventos</TabsTrigger>
              <TabsTrigger value="test">Teste</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Número" value={ch.phone_number ?? "—"} />
                <Stat label="Provider" value={ch.provider_type ?? "—"} />
                <Stat
                  label="Última conexão"
                  value={ch.last_connected_at ? <ClientTime iso={ch.last_connected_at} /> : "Nunca"}
                />
                <Stat label="Limite diário" value={`${ch.daily_message_limit} msgs`} />
                <RoutingSummary channelId={ch.id} />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Mensagens últimos 30 dias</p>
                <div className="h-48 rounded-xl border p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={detail.data?.metrics ?? []}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                      <YAxis fontSize={10} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Area type="monotone" dataKey="messages_sent" stroke="hsl(var(--primary))" fill="url(#g1)" name="Enviadas" />
                      <Area type="monotone" dataKey="messages_received" stroke="hsl(var(--success))" fill="hsl(var(--success)/.1)" name="Recebidas" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-5 pt-4">
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">Resposta automática</p>
                  <p className="text-xs text-muted-foreground">Resposta imediata para novos contatos</p>
                </div>
                <Switch
                  checked={ch.auto_reply_enabled}
                  onCheckedChange={(v) => patch.mutate({ auto_reply_enabled: v })}
                />
              </div>

              <div className="space-y-2">
                <Label>Mensagem fora do expediente</Label>
                <Textarea
                  defaultValue={ch.off_hours_message ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (ch.off_hours_message ?? "")) patch.mutate({ off_hours_message: v || null });
                  }}
                  placeholder="Estamos fora do horário. Retornaremos amanhã às 9h."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Agente IA vinculado</Label>
                <Select
                  value={ch.ai_agent_id ?? "none"}
                  onValueChange={(v) => patch.mutate({ ai_agent_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {(agents.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fluxo de boas-vindas ao receber transferências</Label>
                <Select
                  value={(ch as { default_welcome_flow_id?: string | null }).default_welcome_flow_id ?? "none"}
                  onValueChange={(v) =>
                    patch.mutate({ default_welcome_flow_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {(flows.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                        {f.status !== "active" && (
                          <span className="ml-1 text-[10px] text-muted-foreground">({f.status})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const selectedId = (ch as { default_welcome_flow_id?: string | null }).default_welcome_flow_id;
                  const selected = (flows.data ?? []).find((f) => f.id === selectedId);
                  if (selected && selected.status !== "active") {
                    return (
                      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                        ⚠️ O fluxo selecionado está <b>{selected.status}</b> e não será executado. Ative-o em Fluxos.
                      </p>
                    );
                  }
                  return null;
                })()}
                <p className="text-xs text-muted-foreground">
                  Executado automaticamente quando uma conversa é transferida para este número.
                </p>
              </div>



              <div className="space-y-2">
                <Label>Estratégia de roteamento</Label>
                <div className="grid gap-2">
                  {routingOptions.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => patch.mutate({ routing_strategy: r.value })}
                      className={`text-left rounded-xl border p-3 transition hover:border-primary ${ch.routing_strategy === r.value ? "border-primary bg-primary/5" : ""
                        }`}
                    >
                      <p className="text-sm font-medium">{r.label}</p>
                      <p className="text-xs text-muted-foreground">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Limite diário de mensagens</Label>
                <Input
                  type="number"
                  defaultValue={ch.daily_message_limit}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value);
                    if (v && v !== ch.daily_message_limit) patch.mutate({ daily_message_limit: v });
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="routing" className="pt-0">
              <ChannelRoutingTab channelId={ch.id} />
            </TabsContent>

            <TabsContent value="integration" className="space-y-4 pt-4">
              <IntegrationSettings channel={ch as unknown as ChannelForIntegration} onPatch={(p) => patch.mutate(p)} />
            </TabsContent>


            <TabsContent value="events" className="space-y-3 pt-4">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os eventos</SelectItem>
                  {Object.entries(eventLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-xl border divide-y max-h-[500px] overflow-y-auto">
                {(detail.data?.events ?? [])
                  .filter((e) => eventFilter === "all" || e.event_type === eventFilter)
                  .map((e) => (
                    <div key={e.id} className="flex items-center justify-between p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{eventLabels[e.event_type] ?? e.event_type}</Badge>
                        {e.payload && Object.keys(e.payload as object).length > 0 && (
                          <span className="text-xs text-muted-foreground truncate max-w-[240px]">
                            {JSON.stringify(e.payload)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        <ClientTime iso={e.created_at} />
                      </span>
                    </div>
                  ))}
                {(detail.data?.events ?? []).length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">Sem eventos registrados</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="test" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Número de destino</Label>
                <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+55 11 90000-0000" />
              </div>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea value={testBody} onChange={(e) => setTestBody(e.target.value)} rows={4} />
              </div>
              <Button
                onClick={() => testMut.mutate()}
                disabled={!testPhone || !testBody || testMut.isPending || ch.status !== "connected"}
                className="w-full"
              >
                {testMut.isPending ? "Enviando..." : "Enviar teste"}
              </Button>
              {ch.status !== "connected" && (
                <p className="text-xs text-muted-foreground text-center">O canal precisa estar conectado.</p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

type ChannelForIntegration = {
  id: string;
  provider_type: string | null;
  credentials_status?: {
    has_phone_number_id: boolean;
    has_access_token: boolean;
    has_app_secret: boolean;
  };
  has_webhook_verify_token?: boolean;
};

function IntegrationSettings({
  channel,
  onPatch,
}: {
  channel: ChannelForIntegration;
  onPatch: (p: Record<string, unknown>) => void;
}) {
  const status = channel.credentials_status ?? {
    has_phone_number_id: false,
    has_access_token: false,
    has_app_secret: false,
  };
  const hasVerify = channel.has_webhook_verify_token ?? false;

  // Fields start empty. Typing a value replaces the stored secret; leaving
  // empty preserves it. The server never sends plaintext back to the client.
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const creds = ((channel as { credentials?: Record<string, unknown> }).credentials ?? {}) as Record<string, unknown>;
  const [stevoInstanceId, setStevoInstanceId] = useState(typeof creds.instance_id === "string" ? creds.instance_id : "");
  const [sipServer, setSipServer] = useState(typeof creds.sip_server === "string" ? creds.sip_server : "sm-grilo.stevo.chat:5060");
  const [sipUsername, setSipUsername] = useState(typeof creds.sip_username === "string" ? creds.sip_username : "");
  const [sipPassword, setSipPassword] = useState(typeof creds.sip_password === "string" ? creds.sip_password : "");

  const providerPath = channel.provider_type === "stevo" ? "stevo" : "whatsapp";
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/webhooks/${providerPath}/${channel.id}`
      : `/api/public/webhooks/${providerPath}/${channel.id}`;

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const generateVerify = () => {
    const t = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    setVerifyToken(t);
    onPatch({ webhook_verify_token: t });
  };

  const isCloud = channel.provider_type === "whatsapp_cloud";
  const isStevo = channel.provider_type === "stevo";
  const maskedPlaceholder = "•••••••••••• (configurado)";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="text-sm font-medium">Webhook</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure esta URL no painel do provedor para receber mensagens.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Input readOnly value={webhookUrl} className="text-xs font-mono" />
          <Button variant="outline" size="sm" onClick={() => copy("url", webhookUrl)}>
            {copied === "url" ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">
              Verify token (Meta handshake){hasVerify && !verifyToken ? " — configurado" : ""}
            </Label>
            <Input
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              onBlur={() => {
                if (verifyToken.length > 0) onPatch({ webhook_verify_token: verifyToken });
              }}
              placeholder={hasVerify ? maskedPlaceholder : "Gerar automaticamente"}
              type="password"
            />
          </div>
          <Button variant="outline" size="sm" onClick={generateVerify} className="mt-6">
            Gerar
          </Button>
        </div>
      </div>

      {isCloud ? (
        <div className="space-y-3 rounded-xl border p-3">
          <p className="text-sm font-medium">Credenciais — WhatsApp Cloud API (Meta)</p>
          <div className="space-y-1">
            <Label className="text-xs">
              Phone Number ID{status.has_phone_number_id ? " — configurado" : ""}
            </Label>
            <Input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              onBlur={() => {
                if (phoneNumberId.length > 0)
                  onPatch({ credentials: { phone_number_id: phoneNumberId } });
              }}
              placeholder={status.has_phone_number_id ? maskedPlaceholder : "ex: 123456789012345"}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Access Token (permanente){status.has_access_token ? " — configurado" : ""}
            </Label>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              onBlur={() => {
                if (accessToken.length > 0)
                  onPatch({ credentials: { access_token: accessToken } });
              }}
              placeholder={status.has_access_token ? maskedPlaceholder : "EAA..."}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              App Secret (validação HMAC do webhook){status.has_app_secret ? " — configurado" : ""}
            </Label>
            <Input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              onBlur={() => {
                if (appSecret.length > 0)
                  onPatch({ credentials: { app_secret: appSecret } });
              }}
              placeholder={
                status.has_app_secret
                  ? maskedPlaceholder
                  : "opcional — sem isso, o webhook aceita chamadas sem assinatura"
              }
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Por segurança, credenciais salvas não são exibidas. Digite um novo valor apenas para
            substituí-las. Campos deixados em branco preservam o valor atual.
          </p>
          <TestConnectionButton
            channelId={channel.id}
            enabled={status.has_phone_number_id && status.has_access_token}
          />

          <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs">
            <p className="font-medium text-foreground">Como configurar na Meta</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>Acesse <b>developers.facebook.com</b> → seu App → <b>WhatsApp → API Setup</b>.</li>
              <li>Copie o <b>Phone Number ID</b> e cole no campo acima.</li>
              <li>Em <b>System Users</b>, gere um <b>Access Token permanente</b> com permissões <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>.</li>
              <li>Em <b>App Settings → Basic</b>, copie o <b>App Secret</b> (opcional, mas recomendado para validar a assinatura HMAC do webhook).</li>
              <li>Em <b>WhatsApp → Configuration → Webhook</b>, cole a URL acima e o <b>Verify token</b>. Assine os campos <code>messages</code>.</li>
              <li>Envie uma mensagem de teste para o número — ela deve aparecer no inbox em segundos.</li>
            </ol>
          </div>
        </div>
      ) : isStevo ? (
        <div className="space-y-4 rounded-xl border p-4">
          <p className="text-sm font-medium">Credenciais — Stevo (SM v2 & Stevo Voice)</p>
          <div className="space-y-1">
            <Label className="text-xs">Instance ID</Label>
            <Input
              value={stevoInstanceId}
              onChange={(e) => setStevoInstanceId(e.target.value)}
              onBlur={() => {
                if (stevoInstanceId.length > 0)
                  onPatch({ credentials: { ...creds, instance_id: stevoInstanceId } });
              }}
              placeholder="ex: inst_12345"
            />
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Credenciais SIP (Stevo Voice)</p>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 text-[10px]">Stevo Voice Ativo</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Utilize em qualquer softphone ou PBX (MicroSIP, Zoiper, 3CX) para efetuar chamadas pelo WhatsApp desta instância.
            </p>
            <div className="space-y-2">
              <div>
                <Label className="text-[11px]">Servidor SIP</Label>
                <Input
                  value={sipServer}
                  onChange={(e) => setSipServer(e.target.value)}
                  onBlur={() => onPatch({ credentials: { ...creds, sip_server: sipServer } })}
                  placeholder="ex: sm-grilo.stevo.chat:5060"
                />
              </div>
              <div>
                <Label className="text-[11px]">Usuário SIP</Label>
                <Input
                  value={sipUsername}
                  onChange={(e) => setSipUsername(e.target.value)}
                  onBlur={() => onPatch({ credentials: { ...creds, sip_username: sipUsername } })}
                  placeholder="ex: Zenda_1785950675671"
                />
              </div>
              <div>
                <Label className="text-[11px]">Senha SIP (Stevo Voice)</Label>
                <Input
                  type="password"
                  value={sipPassword}
                  onChange={(e) => setSipPassword(e.target.value)}
                  onBlur={() => onPatch({ credentials: { ...creds, sip_password: sipPassword } })}
                  placeholder="••••••••••••••••"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Provedor <b>{channel.provider_type ?? "não definido"}</b> ainda não tem integração automática.
          As mensagens ficam apenas no inbox interno.
        </div>
      )}
    </div>
  );
}

function TestConnectionButton({ channelId, enabled }: { channelId: string; enabled: boolean }) {
  const qc = useQueryClient();
  const testFn = useServerFn(testChannelConnection);
  const [result, setResult] = useState<
    | { ok: true; display_phone_number: string | null; verified_name: string | null }
    | { ok: false; message: string }
    | null
  >(null);

  const m = useMutation({
    mutationFn: async () => testFn({ data: { id: channelId } }),
    onSuccess: (r) => {
      if (r.ok) {
        setResult({
          ok: true,
          display_phone_number: r.display_phone_number,
          verified_name: r.verified_name,
        });
        toast.success("Conexão validada com a Meta");
        qc.invalidateQueries({ queryKey: ["channel", channelId] });
        qc.invalidateQueries({ queryKey: ["channels"] });
      } else {
        setResult({ ok: false, message: r.message });
        toast.error(r.message);
      }
    },
    onError: () => {
      const msg = "Não foi possível testar a conexão. Tente novamente.";
      setResult({ ok: false, message: msg });
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!enabled || m.isPending}
        onClick={() => m.mutate()}
        title={enabled ? "" : "Preencha Phone Number ID e Access Token"}
      >
        {m.isPending ? "Testando..." : "Testar conexão"}
      </Button>
      {result?.ok && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            Conexão OK com a Meta
          </p>
          {(result.display_phone_number || result.verified_name) && (
            <p className="mt-1 text-muted-foreground">
              {result.verified_name ? <b>{result.verified_name}</b> : null}
              {result.verified_name && result.display_phone_number ? " · " : null}
              {result.display_phone_number ?? null}
            </p>
          )}
        </div>
      )}
      {result && !result.ok && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {result.message}
        </div>
      )}
    </div>
  );
}



