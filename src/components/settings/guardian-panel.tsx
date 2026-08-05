import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  Loader2,
  Play,
  Plug,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  guardianActiveProvider,
  guardianAnalyzeIncident,
  guardianAutoFix,
  guardianChat,
  guardianChatHistory,
  guardianAuditLog,
  guardianGetIncident,
  guardianIgnoreIncident,
  guardianListIncidents,
  guardianOverview,
  guardianResendMessage,
  guardianResolveIncident,
  guardianRetryFlowRun,
  guardianRunSelect,
  guardianScan,
  guardianTestProvider,
  guardianToggleIntegration,
  guardianValidateFix,
} from "@/lib/guardian.functions";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { GuardianIncident, GuardianScanResult, GuardianSeverity } from "@/lib/guardian.types";
import { GuardianHealthSparkline } from "@/components/guardian/health-sparkline";

type ChatMsg = { role: "user" | "assistant"; content: string };
type IncidentFilter = "all" | GuardianIncident["kind"];
const DEFAULT_SQL = "SELECT id, action, status, created_at FROM guardian_runs ORDER BY created_at DESC LIMIT 20";

export function GuardianPanel({ initialIncidentId }: { initialIncidentId?: string } = {}) {
  const queryClient = useQueryClient();
  const [details, setDetails] = useState<GuardianIncident | null>(null);
  const [filter, setFilter] = useState<IncidentFilter>("all");
  const [liveIncidentId, setLiveIncidentId] = useState<string | null>(initialIncidentId ?? null);
  const [tab, setTab] = useState<string>(initialIncidentId ? "live" : "audit");

  useEffect(() => {
    if (initialIncidentId) {
      setLiveIncidentId(initialIncidentId);
      setTab("live");
    }
  }, [initialIncidentId]);

  const overview = useQuery({
    queryKey: ["guardian-overview"],
    queryFn: () => guardianOverview({ data: { windowHours: 168 } }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const activeProvider = useQuery({
    queryKey: ["guardian-active-provider"],
    queryFn: () => guardianActiveProvider(),
    refetchInterval: 60_000,
    retry: 1,
  });

  // Realtime: any change to guardian_incidents of my company invalidates the panel.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user || cancelled) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userRes.user.id)
        .maybeSingle();
      const cid = prof?.company_id;
      if (!cid || cancelled) return;
      channel = supabase
        .channel(`guardian-incidents-${cid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "guardian_incidents", filter: `company_id=eq.${cid}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["guardian-overview"] });
            queryClient.invalidateQueries({ queryKey: ["guardian-incidents"] });
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const testProvider = useMutation({
    mutationFn: () => guardianTestProvider(),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Provedor OK · ${r.provider} · ${r.latencyMs} ms`);
      else toast.error(`Falha no provedor: ${r.error}`);
      queryClient.invalidateQueries({ queryKey: ["guardian-active-provider"] });
    },
    onError: (e) => toast.error(readError(e)),
  });

  const scan = useMutation({
    mutationFn: () => guardianScan(),
    onSuccess: () => {
      toast.success("Varredura concluída pelo Guardião.");
      queryClient.invalidateQueries({ queryKey: ["guardian-overview"] });
      queryClient.invalidateQueries({ queryKey: ["guardian-chat-history"] });
    },
    onError: (error) => toast.error(readError(error)),
  });

  const resend = useMutation({
    mutationFn: (id: string) => guardianResendMessage({ data: { messageId: id } }),
    onSuccess: () => {
      toast.success("Mensagem reenviada com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["guardian-overview"] });
    },
    onError: (error) => toast.error(readError(error)),
  });

  const retryFlow = useMutation({
    mutationFn: (id: string) => guardianRetryFlowRun({ data: { runId: id } }),
    onSuccess: () => {
      toast.success("Fluxo recolocado para processamento.");
      queryClient.invalidateQueries({ queryKey: ["guardian-overview"] });
    },
    onError: (error) => toast.error(readError(error)),
  });

  const toggleIntegration = useMutation({
    mutationFn: (payload: { id: string; enabled: boolean }) => guardianToggleIntegration({ data: payload }),
    onSuccess: () => {
      toast.success("Integração atualizada pelo Guardião.");
      queryClient.invalidateQueries({ queryKey: ["guardian-overview"] });
    },
    onError: (error) => toast.error(readError(error)),
  });

  const data = overview.data as GuardianScanResult | undefined;
  const incidents = useMemo(() => {
    const list = data?.incidents ?? [];
    return filter === "all" ? list : list.filter((incident) => incident.kind === filter);
  }, [data?.incidents, filter]);

  return (
    <div className="space-y-5">
      {overview.error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Guardião não conseguiu abrir a análise</AlertTitle>
          <AlertDescription>
            {readError(overview.error)}. A tela continua disponível para nova tentativa.
          </AlertDescription>
        </Alert>
      ) : null}

      {activeProvider.data ? (
        <Alert className="border-primary/30 bg-primary/5">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertTitle className="flex flex-wrap items-center gap-2">
            IA ativa: <Badge variant="outline">{activeProvider.data.label}</Badge>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7"
              onClick={() => testProvider.mutate()}
              disabled={testProvider.isPending}
            >
              {testProvider.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1 h-3.5 w-3.5" />
              )}
              Testar provedor
            </Button>
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              {activeProvider.data.source === "user"
                ? "O Guardião está usando a chave cadastrada em Configurações → APIs. Troque de provedor a qualquer momento."
                : activeProvider.data.source === "fallback"
                  ? "Nenhum provedor configurado — usando fallback do Lovable AI. Cadastre uma chave em Configurações → APIs para usar seu próprio provedor (OpenAI, Anthropic ou Google Gemini)."
                  : activeProvider.data.label}
            </span>
            {activeProvider.data.source !== "user" ? (
              <Link
                to="/settings"
                className="inline-flex w-fit items-center gap-1 rounded-md border border-primary/30 bg-background px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Configurar chave de IA
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}



      <GuardianHero
        data={data}
        loading={overview.isLoading || scan.isPending}
        onScan={() => scan.mutate()}
        onRefresh={() => overview.refetch()}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Activity} label="Mensagens na última hora" value={data?.health.messagesLastHour ?? "—"} />
        <Metric
          icon={AlertTriangle}
          label="Falhas em 24h"
          value={data?.health.failuresLast24h ?? "—"}
          tone={(data?.health.failuresLast24h ?? 0) > 0 ? "danger" : "success"}
        />
        <Metric
          icon={Plug}
          label="Integrações ativas"
          value={data ? `${data.health.integrationsOn}/${data.health.integrationsTotal}` : "—"}
          hint={(data?.health.integrationsError ?? 0) > 0 ? `${data?.health.integrationsError} com erro` : undefined}
          tone={(data?.health.integrationsError ?? 0) > 0 ? "warning" : "default"}
        />
        <Metric
          icon={Webhook}
          label="Canais online"
          value={data ? `${data.health.channelsOnline}/${data.health.channelsTotal}` : "—"}
          tone={data && data.health.channelsTotal > 0 && data.health.channelsOnline === 0 ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Radar className="h-4 w-4 text-primary" /> Incidentes detectados
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  O Guardião prioriza impactos reais: mensagens, fluxos, canais, integrações, campanhas e cascatas.
                </p>
              </div>
              <Select value={filter} onValueChange={(value) => setFilter(value as IncidentFilter)}>
                <SelectTrigger className="h-9 w-full md:w-[180px]">
                  <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="message">Mensagens</SelectItem>
                  <SelectItem value="flow">Fluxos</SelectItem>
                  <SelectItem value="integration">Integrações</SelectItem>
                  <SelectItem value="channel">Canais</SelectItem>
                  <SelectItem value="broadcast">Campanhas</SelectItem>
                  <SelectItem value="cascade">Cascatas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {overview.isLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-md bg-muted/40" />
                ))}
              </div>
            ) : incidents.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={CheckCircle2}
                  title="Nenhum incidente nesta visão"
                  description="Ajuste o filtro ou execute uma nova análise para atualizar o radar."
                />
              </div>
            ) : (
              <div className="divide-y">
                {incidents.slice(0, 18).map((incident) => (
                  <IncidentRow
                    key={`${incident.kind}-${incident.id}`}
                    incident={incident}
                    onDetails={() => setDetails(incident)}
                    onRepair={() => {
                      if (incident.repairAction === "resend_message") resend.mutate(incident.id);
                      else if (incident.repairAction === "retry_flow") retryFlow.mutate(incident.id);
                      else if (incident.repairAction === "toggle_integration") {
                        const enabled = incident.payload.enabled !== true;
                        toggleIntegration.mutate({ id: incident.id, enabled });
                      } else setDetails(incident);
                    }}
                    repairing={resend.isPending || retryFlow.isPending || toggleIntegration.isPending}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Recommendations data={data} />
          <GuardianChat />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="live">Incidentes ao vivo</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
          <TabsTrigger value="sql">Consulta segura</TabsTrigger>
        </TabsList>
        <TabsContent value="live">
          <LiveIncidents
            focusIncidentId={liveIncidentId}
            onFocusHandled={() => setLiveIncidentId(null)}
          />
        </TabsContent>
        <TabsContent value="audit">
          <AuditPreview />
        </TabsContent>
        <TabsContent value="sql">
          <ReadOnlySql />
        </TabsContent>
      </Tabs>

      <Sheet open={details != null} onOpenChange={(open) => (!open ? setDetails(null) : null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{details?.title}</SheetTitle>
            <SheetDescription>{details?.impact}</SheetDescription>
          </SheetHeader>
          {details ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm">
                <Info label="Severidade" value={<SeverityBadge severity={details.severity} />} />
                <Info label="Status" value={details.status} />
                <Info label="Causa provável" value={details.probableCause} />
                <Info label="Ação recomendada" value={details.recommendedAction} />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Payload técnico</p>
                <pre className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
                  {JSON.stringify(details.payload, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GuardianHero({
  data,
  loading,
  onScan,
  onRefresh,
}: {
  data?: GuardianScanResult;
  loading: boolean;
  onScan: () => void;
  onRefresh: () => void;
}) {
  const score = data?.score ?? 0;
  const tone = data?.status ?? "warning";
  return (
    <section className="relative overflow-hidden rounded-lg border bg-card">
      <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_260px] lg:p-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Agente operacional
            </Badge>
            <SeverityBadge severity={tone} />
            {data?.generatedAt ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="h-3 w-3" /> {formatDate(data.generatedAt)}
              </span>
            ) : null}
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold md:text-3xl">Guardião do sistema</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {data?.summary ?? "Clique em Analisar agora para o agente auditar mensagens, fluxos, canais, integrações e automações."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onScan} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Analisar agora
            </Button>
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar radar
            </Button>
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Score de saúde</p>
              <p className="mt-1 text-4xl font-bold">{data ? score : "—"}</p>
            </div>
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <Progress value={data ? score : 0} className="mt-4" />
          <p className="mt-3 text-xs text-muted-foreground">
            {data ? `${data.incidents.length} incidente(s) classificados pelo Guardião.` : "Aguardando primeira leitura."}
          </p>
          <div className="mt-4 border-t pt-3">
            <GuardianHealthSparkline />
          </div>

        </div>
      </div>
    </section>
  );
}

function IncidentRow({
  incident,
  onDetails,
  onRepair,
  repairing,
}: {
  incident: GuardianIncident;
  onDetails: () => void;
  onRepair: () => void;
  repairing: boolean;
}) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={incident.severity} />
          <Badge variant="secondary">{kindLabel(incident.kind)}</Badge>
          <span className="text-xs text-muted-foreground">{incident.detectedAt ? formatDate(incident.detectedAt) : "sem data"}</span>
        </div>
        <div>
          <p className="font-medium">{incident.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{incident.probableCause}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button size="sm" variant="ghost" onClick={onDetails}>
          <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes
        </Button>
        <Button size="sm" variant="outline" onClick={onRepair} disabled={repairing}>
          {repairing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
          {repairLabel(incident)}
        </Button>
      </div>
    </div>
  );
}

function Recommendations({ data }: { data?: GuardianScanResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Recomendações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(data?.recommendations ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Execute uma varredura para receber recomendações.</p>
        ) : (
          data?.recommendations.map((item) => (
            <div key={item.title} className="rounded-md border bg-muted/20 p-3">
              <div className="mb-1 flex items-center gap-2">
                <SeverityBadge severity={item.severity} />
                <p className="text-sm font-medium">{item.title}</p>
              </div>
              <p className="text-xs text-muted-foreground">{item.body}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function GuardianChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const history = useQuery({
    queryKey: ["guardian-chat-history"],
    queryFn: () => guardianChatHistory(),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (messages.length === 0 && history.data?.messages?.length) {
      setMessages(
        history.data.messages
          .filter((message): message is ChatMsg => message.role === "user" || message.role === "assistant")
          .slice(-10),
      );
    }
  }, [history.data?.messages, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const chat = useMutation({
    mutationFn: async (nextMessages: ChatMsg[]) => {
      const response = await guardianChat({ data: { messages: nextMessages } });
      return response.text;
    },
    onSuccess: (text) => setMessages((prev) => [...prev, { role: "assistant", content: text }]),
    onError: (error) => {
      toast.error(readError(error));
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  function submit() {
    const trimmed = input.trim();
    if (!trimmed || chat.isPending) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    chat.mutate(next);
  }

  return (
    <Card className="flex min-h-[520px] flex-col">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" /> Agente Guardião
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Pergunte o que quebrou, por que falhou e qual reparo executar.</p>
          </div>
          {messages.length ? (
            <Button size="icon" variant="ghost" onClick={() => setMessages([])} title="Limpar conversa">
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <ScrollArea className="h-[330px] rounded-md border bg-muted/20 p-3">
          <div className="space-y-3 pr-3">
            {messages.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="Pronto para diagnosticar"
                description="Ex.: analise meus fluxos falhados e diga o que corrigir primeiro."
              />
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === "user"
                      ? "ml-8 rounded-md bg-primary/10 p-3 text-sm"
                      : "mr-8 rounded-md border bg-background p-3 text-sm"
                  }
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    {message.role === "user" ? "Você" : "Guardião"}
                  </p>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              ))
            )}
            {chat.isPending ? (
              <div className="mr-8 flex items-center gap-2 rounded-md border bg-background p-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando snapshot operacional…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Ex.: o que está impedindo meus envios automáticos?"
            className="min-h-[72px] resize-none"
          />
          <Button onClick={submit} disabled={chat.isPending || !input.trim()}>
            {chat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditPreview() {
  const audit = useQuery({
    queryKey: ["guardian-audit-preview"],
    queryFn: () => guardianAuditLog(),
    retry: 1,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TerminalSquare className="h-4 w-4 text-primary" /> Histórico de auditoria
        </CardTitle>
      </CardHeader>
      <CardContent>
        {audit.isLoading ? (
          <div className="h-28 animate-pulse rounded-md bg-muted/40" />
        ) : audit.error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Auditoria indisponível</AlertTitle>
            <AlertDescription>{readError(audit.error)}</AlertDescription>
          </Alert>
        ) : (
          <RowsTable rows={audit.data?.rows ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

function ReadOnlySql() {
  const [sql, setSql] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SQL;
    return window.localStorage.getItem("guardian.sql") ?? DEFAULT_SQL;
  });

  useEffect(() => {
    window.localStorage.setItem("guardian.sql", sql);
  }, [sql]);

  const runSql = useMutation({
    mutationFn: () => guardianRunSelect({ data: { sql } }),
    onError: (error) => toast.error(readError(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" /> Consulta segura do Guardião
        </CardTitle>
        <p className="text-xs text-muted-foreground">Somente leitura, limitado a 200 linhas e com comandos destrutivos bloqueados.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={sql} onChange={(event) => setSql(event.target.value)} className="font-mono text-xs" />
        <Button size="sm" onClick={() => runSql.mutate()} disabled={runSql.isPending}>
          {runSql.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
          Executar SELECT
        </Button>
        {runSql.data ? <RowsTable rows={runSql.data.rows} /> : null}
      </CardContent>
    </Card>
  );
}

function RowsTable({ rows }: { rows: Array<Record<string, string | number | boolean | null>> }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sem resultados.</p>;
  const columns = Object.keys(rows[0] ?? {});
  return (
    <div className="max-h-80 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} className="font-mono text-xs">{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={column} className="max-w-[260px] truncate text-xs">
                  {row[column] === null ? <span className="text-muted-foreground">null</span> : String(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-md bg-muted/40 p-2 ${toneText(tone)}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: GuardianSeverity }) {
  const label = severity === "critical" ? "Crítico" : severity === "warning" ? "Atenção" : "Saudável";
  return <Badge variant={severity === "critical" ? "destructive" : "secondary"}>{label}</Badge>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function repairLabel(incident: GuardianIncident) {
  if (incident.repairAction === "resend_message") return "Reenviar";
  if (incident.repairAction === "retry_flow") return "Reprocessar";
  if (incident.repairAction === "toggle_integration") return incident.payload.enabled === true ? "Desativar" : "Ativar";
  return "Inspecionar";
}

function kindLabel(kind: GuardianIncident["kind"]) {
  const labels: Record<GuardianIncident["kind"], string> = {
    message: "Mensagem",
    flow: "Fluxo",
    integration: "Integração",
    channel: "Canal",
    broadcast: "Campanha",
    cascade: "Cascata",
  };
  return labels[kind];
}

function toneText(tone: "default" | "success" | "warning" | "danger") {
  if (tone === "danger") return "text-destructive";
  if (tone === "warning") return "text-warning";
  if (tone === "success") return "text-success";
  return "text-primary";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Falha ao executar ação do Guardião.";
}

/* -----------------------------------------------------------
 * Live Incidents — errors captured across the app in real time.
 * ----------------------------------------------------------- */

type LiveIncident = {
  id: string;
  kind: string;
  severity: string;
  status: string;
  message: string;
  route: string | null;
  occurrences: number;
  requires_code_change: boolean;
  fix_summary: string | null;
  diagnosis: { markdown?: string } | null;
  last_seen_at: string;
  created_at: string;
};

function LiveIncidents({
  focusIncidentId,
  onFocusHandled,
}: {
  focusIncidentId?: string | null;
  onFocusHandled?: () => void;
}) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"open" | "analyzing" | "resolved" | "ignored" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["guardian-live-incidents", statusFilter],
    queryFn: () => guardianListIncidents({ data: { status: statusFilter } }),
    refetchInterval: 20_000,
    retry: 1,
  });

  useEffect(() => {
    if (focusIncidentId) {
      setOpenId(focusIncidentId);
      onFocusHandled?.();
    }
  }, [focusIncidentId, onFocusHandled]);

  const incidents = (list.data?.incidents ?? []) as LiveIncident[];

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-primary" /> Incidentes capturados
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Erros de runtime, promises e componentes reportados por toda a plataforma. Clique para o Guardião analisar.
            </p>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-9 w-full md:w-[180px]">
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Abertos</SelectItem>
              <SelectItem value="analyzing">Em análise</SelectItem>
              <SelectItem value="resolved">Resolvidos</SelectItem>
              <SelectItem value="ignored">Ignorados</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {list.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted/40" />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={CheckCircle2}
              title="Nenhum incidente nesta visão"
              description="Quando um erro ocorrer em qualquer tela do sistema, ele aparece aqui automaticamente."
            />
          </div>
        ) : (
          <div className="divide-y">
            {incidents.map((incident) => (
              <button
                key={incident.id}
                type="button"
                onClick={() => setOpenId(incident.id)}
                className="grid w-full gap-2 p-4 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={incident.severity === "critical" || incident.severity === "high" ? "destructive" : "secondary"}>
                    {incident.severity}
                  </Badge>
                  <Badge variant="outline">{incident.kind}</Badge>
                  <Badge variant="outline">{incident.status}</Badge>
                  {incident.occurrences > 1 ? (
                    <Badge variant="secondary">×{incident.occurrences}</Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">{formatDate(incident.last_seen_at)}</span>
                </div>
                <p className="line-clamp-2 text-sm font-medium">{incident.message}</p>
                {incident.route ? (
                  <p className="font-mono text-[10px] text-muted-foreground">{incident.route}</p>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <IncidentSheet
        incidentId={openId}
        onClose={() => {
          setOpenId(null);
          queryClient.invalidateQueries({ queryKey: ["guardian-live-incidents"] });
        }}
      />
    </Card>
  );
}

function IncidentSheet({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const open = incidentId != null;

  const detail = useQuery({
    queryKey: ["guardian-incident", incidentId],
    queryFn: () => guardianGetIncident({ data: { id: incidentId! } }),
    enabled: open,
    retry: 1,
  });

  const analyze = useMutation({
    mutationFn: () => guardianAnalyzeIncident({ data: { id: incidentId! } }),
    onSuccess: () => {
      toast.success("Diagnóstico concluído.");
      queryClient.invalidateQueries({ queryKey: ["guardian-incident", incidentId] });
      queryClient.invalidateQueries({ queryKey: ["guardian-live-incidents"] });
    },
    onError: (e) => toast.error(readError(e)),
  });

  const resolve = useMutation({
    mutationFn: () => guardianResolveIncident({ data: { id: incidentId! } }),
    onSuccess: () => {
      toast.success("Incidente resolvido.");
      queryClient.invalidateQueries({ queryKey: ["guardian-live-incidents"] });
      onClose();
    },
    onError: (e) => toast.error(readError(e)),
  });

  const ignore = useMutation({
    mutationFn: () => guardianIgnoreIncident({ data: { id: incidentId! } }),
    onSuccess: () => {
      toast.success("Incidente ignorado.");
      queryClient.invalidateQueries({ queryKey: ["guardian-live-incidents"] });
      onClose();
    },
    onError: (e) => toast.error(readError(e)),
  });

  const validateFix = useMutation({
    mutationFn: () => guardianValidateFix({ data: { id: incidentId! } }),
    onSuccess: (r) => {
      if (r.validated) {
        toast.success(`Correção validada — sistema OK (score ${r.score}).`);
        queryClient.invalidateQueries({ queryKey: ["guardian-live-incidents"] });
        onClose();
      } else {
        toast.warning(`Ainda existem ${r.openIncidents} incidente(s) operacionais.`);
        queryClient.invalidateQueries({ queryKey: ["guardian-overview"] });
      }
    },
    onError: (e) => toast.error(readError(e)),
  });

  const incident = detail.data?.incident as
    | (LiveIncident & { stack: string | null; context: Record<string, unknown> })
    | undefined;

  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Análise do Guardião</SheetTitle>
          <SheetDescription>Diagnóstico técnico com causa raiz e próxima ação.</SheetDescription>
        </SheetHeader>

        {detail.isLoading ? (
          <div className="mt-6 h-40 animate-pulse rounded-md bg-muted/40" />
        ) : incident ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="font-medium">{incident.message}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant={incident.severity === "high" || incident.severity === "critical" ? "destructive" : "secondary"}>
                  {incident.severity}
                </Badge>
                <Badge variant="outline">{incident.kind}</Badge>
                <Badge variant="outline">{incident.status}</Badge>
                {incident.route ? <Badge variant="outline" className="font-mono">{incident.route}</Badge> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => analyze.mutate()} disabled={analyze.isPending}>
                {analyze.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {incident.diagnosis?.markdown ? "Reanalisar" : "Analisar com Guardião"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => resolve.mutate()} disabled={resolve.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como resolvido
              </Button>
              <Button size="sm" variant="secondary" onClick={() => validateFix.mutate()} disabled={validateFix.isPending}>
                {validateFix.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Validar correção
              </Button>
              <AutoFixButton incidentId={incidentId} incident={incident} onDone={() => {
                queryClient.invalidateQueries({ queryKey: ["guardian-incident", incidentId] });
                queryClient.invalidateQueries({ queryKey: ["guardian-live-incidents"] });
                queryClient.invalidateQueries({ queryKey: ["guardian-overview"] });
              }} />
              <Button size="sm" variant="ghost" onClick={() => ignore.mutate()} disabled={ignore.isPending}>
                Ignorar
              </Button>
            </div>

            {incident.diagnosis?.markdown ? (
              <div className="rounded-md border bg-background p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Diagnóstico da IA</p>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{incident.diagnosis.markdown}</ReactMarkdown>
                </div>
                {incident.requires_code_change ? (
                  <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                    <strong>Requer alteração de código.</strong> Copie o diagnóstico acima e cole no chat do Lovable para aplicar o patch.
                    <Button
                      size="sm"
                      variant="link"
                      className="ml-2 h-auto p-0"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `Guardião detectou o seguinte incidente e pediu correção:\n\nMensagem: ${incident.message}\nRota: ${incident.route ?? "?"}\n\nDiagnóstico:\n${incident.diagnosis?.markdown ?? ""}\n\nStack:\n${incident.stack ?? ""}`,
                        );
                        toast.success("Prompt copiado.");
                      }}
                    >
                      Copiar prompt para Lovable
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ainda não analisado</AlertTitle>
                <AlertDescription>Clique em "Analisar com Guardião" para gerar diagnóstico completo.</AlertDescription>
              </Alert>
            )}

            {incident.stack ? (
              <details className="rounded-md border bg-muted/20 p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground">Stack trace</summary>
                <pre className="mt-2 max-h-72 overflow-auto text-[10px]">{incident.stack}</pre>
              </details>
            ) : null}

            {incident.context && Object.keys(incident.context).length > 0 ? (
              <details className="rounded-md border bg-muted/20 p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground">Contexto</summary>
                <pre className="mt-2 max-h-72 overflow-auto text-[10px]">{JSON.stringify(incident.context, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 text-sm text-muted-foreground">Selecione um incidente para ver detalhes.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AutoFixButton({
  incidentId,
  incident,
  onDone,
}: {
  incidentId: string | null;
  incident: { context?: Record<string, unknown> } | undefined;
  onDone: () => void;
}) {
  const ctx = (incident?.context ?? {}) as Record<string, unknown>;
  const action = ctx.repairAction as string | undefined;
  const supported = action === "toggle_integration" || action === "retry_flow";
  const autoFix = useMutation({
    mutationFn: () => guardianAutoFix({ data: { id: incidentId! } }),
    onSuccess: (r) => {
      if (r.validation.validated) toast.success(`Correção aplicada: ${r.detail}`);
      else toast.warning(`Correção aplicada, mas revalidação falhou: ${r.validation.reason}`);
      onDone();
    },
    onError: (e) => toast.error(readError(e)),
  });
  if (!supported || !incidentId) return null;
  return (
    <Button size="sm" variant="default" onClick={() => autoFix.mutate()} disabled={autoFix.isPending}>
      {autoFix.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
      Aplicar correção sugerida
    </Button>
  );
}