import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Loader2, Bot } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClientTime } from "@/components/client-time";
import { listFlowRuns } from "@/lib/flows.functions";

export const Route = createFileRoute("/_authenticated/flows/$flowId/runs")({
  head: () => ({
    meta: [
      { title: "Execuções do fluxo — Zenda" },
      { name: "description", content: "Histórico de execuções e diagnóstico de fluxos." },
    ],
  }),
  component: FlowRunsPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 text-sm">
      <p className="mb-3 text-destructive">Falha ao carregar execuções: {error.message}</p>
      <Button size="sm" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Fluxo não encontrado.</div>,
});

function FlowRunsPage() {
  const { flowId } = useParams({ from: "/_authenticated/flows/$flowId/runs" });
  const fn = useServerFn(listFlowRuns);
  const { data, isLoading } = useQuery({
    queryKey: ["flow-runs", flowId],
    queryFn: () => fn({ data: { flowId } }),
    refetchInterval: 15_000,
  });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button asChild size="icon" variant="ghost">
          <Link to="/flows">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold">
            Execuções — {data?.flow.name ?? "…"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Últimas execuções deste fluxo. Atualiza a cada 15s.
          </p>
        </div>
        {data && (
          <Badge variant={data.flow.status === "active" ? "default" : "secondary"} className="ml-auto">
            {data.flow.status}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (data?.runs.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Bot className="h-8 w-8" />
            Nenhuma execução ainda. Transfira uma conversa para um canal com este fluxo padrão para acionar.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {(data?.runs ?? []).map((r) => {
                const contact = (r.conversation as {
                  id: string;
                  contact: { id: string; name: string } | null;
                } | null)?.contact;
                const channel = r.channel as { id: string; name: string } | null;
                const convId = (r.conversation as { id: string } | null)?.id;
                return (
                  <div key={r.id} className="flex items-center gap-4 p-4 text-sm">
                    <StatusIcon status={r.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">
                          {contact?.name ?? "Contato removido"}
                        </p>
                        {channel && (
                          <Badge variant="outline" className="text-[10px]">
                            {channel.name}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          <ClientTime iso={r.started_at} />
                        </span>
                        <span>{r.messages_sent} mensagem(ns) enviada(s)</span>
                        {r.error && (
                          <span className="text-destructive">erro: {r.error}</span>
                        )}
                      </div>
                    </div>
                    {convId && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/inbox/$conversationId" params={{ conversationId: convId }}>
                          Abrir conversa →
                        </Link>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string | null }) {
  if (status === "completed")
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="concluído" />;
  if (status === "failed")
    return <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-label="falhou" />;
  if (status === "running")
    return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-label="executando" />;
  return <Clock className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="pendente" />;
}
