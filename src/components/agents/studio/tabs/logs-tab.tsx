import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { AlertTriangle, Sparkles } from "lucide-react";
import { listAgentLogs } from "@/lib/agent-studio.functions";

export function LogsTab({ agentId }: { agentId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["agent-logs", agentId],
    queryFn: () => listAgentLogs({ data: { agentId, limit: 100 } }),
  });

  if (isLoading) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Carregando…</p>;
  }
  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhuma execução registrada ainda. Use o Playground para gerar logs.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card">
      {logs.map((l) => (
        <div key={l.id} className="log-row">
          <div className="flex items-center gap-2">
            {l.error ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(l.created_at), { locale: ptBR, addSuffix: true })}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">▶ {l.prompt ?? "—"}</p>
            <p className="mt-0.5 truncate text-sm">
              {l.error ? (
                <span className="text-destructive">{l.error}</span>
              ) : (
                l.response ?? "—"
              )}
            </p>
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            <p className="font-mono">{l.model ?? "—"}</p>
            <p>
              {l.latency_ms ?? "—"}ms · {(l.tokens_in ?? 0) + (l.tokens_out ?? 0)} tk
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
