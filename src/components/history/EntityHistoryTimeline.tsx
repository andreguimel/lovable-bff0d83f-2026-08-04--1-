import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, User, Filter, History } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/states/loading-state";
import { ErrorState } from "@/components/ui/states/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { listEntityHistory } from "@/lib/entity-history.functions";

interface Props {
  entity?: string;
  entityId?: string;
  showFilters?: boolean;
  className?: string;
}

function shallowDiff(before: any, after: any): Array<{ key: string; from: any; to: any }> {
  if (!before && !after) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: Array<{ key: string; from: any; to: any }> = [];
  for (const k of keys) {
    const b = before?.[k], a = after?.[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) out.push({ key: k, from: b, to: a });
  }
  return out;
}

function fmt(v: any) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function EntityHistoryTimeline({ entity, entityId, showFilters = true, className }: Props) {
  const [actionFilter, setActionFilter] = useState("");
  const fn = useServerFn(listEntityHistory);
  const q = useQuery({
    queryKey: ["entity-history", entity, entityId, actionFilter],
    queryFn: () => fn({ data: { entity, entityId, action: actionFilter || undefined, limit: 50 } }),
  });

  const rows = q.data?.rows ?? [];

  if (q.isPending) return <LoadingState rows={5} label="Carregando histórico…" />;
  if (q.error) return <ErrorState message={String(q.error)} onRetry={() => q.refetch()} />;

  return (
    <div className={"space-y-4 " + (className ?? "")}>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <Filter className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filtrar por ação…" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>Atualizar</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={History} title="Sem histórico" description="Nenhuma alteração registrada ainda." />
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-6">
          {rows.map((r: any) => {
            const diffs = shallowDiff(r.before, r.after);
            return (
              <li key={r.id} className="relative">
                <span className="absolute -left-[26px] top-2 flex h-3 w-3 items-center justify-center rounded-full border border-border bg-background">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <div className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{r.action}</Badge>
                    {r.entity && <span className="font-mono text-xs text-muted-foreground">{r.entity}{r.entity_id ? `#${String(r.entity_id).slice(0, 8)}` : ""}</span>}
                    {r.version && <Badge variant="secondary">v{r.version}</Badge>}
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    {r.profiles?.full_name ?? r.profiles?.email ?? r.actor_id?.slice(0, 8) ?? "sistema"}
                    {r.correlation_id && (
                      <span className="ml-2 font-mono text-[10px] opacity-60">↳ {String(r.correlation_id).slice(0, 8)}</span>
                    )}
                  </div>
                  {r.change_reason && (
                    <div className="mt-2 rounded bg-muted/50 p-2 text-xs italic">"{r.change_reason}"</div>
                  )}
                  {diffs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {diffs.slice(0, 6).map((d) => (
                        <div key={d.key} className="grid grid-cols-[100px_1fr_1fr] gap-2 text-xs">
                          <span className="font-mono text-muted-foreground">{d.key}</span>
                          <span className="truncate rounded bg-destructive/10 px-1.5 py-0.5 line-through">{fmt(d.from)}</span>
                          <span className="truncate rounded bg-emerald-500/10 px-1.5 py-0.5">{fmt(d.to)}</span>
                        </div>
                      ))}
                      {diffs.length > 6 && (
                        <div className="text-xs text-muted-foreground">+{diffs.length - 6} campo(s) alterado(s)</div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
