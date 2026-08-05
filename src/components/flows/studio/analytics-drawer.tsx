import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listFlowRuns } from "@/lib/flows.functions";

interface Props {
  flowId: string;
  open: boolean;
  onClose: () => void;
}

export function AnalyticsDrawer({ flowId, open, onClose }: Props) {
  const fn = useServerFn(listFlowRuns);
  const { data, isLoading } = useQuery({
    queryKey: ["flow-analytics", flowId],
    queryFn: () => fn({ data: { flowId } }),
    enabled: open,
  });

  const runs = data?.runs ?? [];
  const total = runs.length;
  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const success = total > 0 ? Math.round((completed / total) * 100) : 0;
  const msgSent = runs.reduce((acc, r) => acc + (r.messages_sent ?? 0), 0);
  const avgDuration = (() => {
    const done = runs.filter(
      (r) => typeof r.completed_at === "string" && typeof r.started_at === "string",
    );
    if (done.length === 0) return null;
    const totalMs = done.reduce(
      (acc, r) =>
        acc +
        (new Date(r.completed_at as string).getTime() -
          new Date(r.started_at as string).getTime()),
      0,
    );
    return Math.round(totalMs / done.length / 100) / 10;
  })();

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Analytics do fluxo</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Execuções" value={total.toLocaleString("pt-BR")} />
              <Kpi label="Sucesso" value={total > 0 ? `${success}%` : "—"} />
              <Kpi label="Falhas" value={failed.toLocaleString("pt-BR")} tone="destructive" />
              <Kpi
                label="Mensagens"
                value={msgSent.toLocaleString("pt-BR")}
                tone="primary"
              />
              <Kpi
                label="Tempo médio"
                value={avgDuration ? `${avgDuration}s` : "—"}
              />
              <Kpi label="Recentes" value={String(runs.slice(0, 20).length)} />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Últimas execuções
              </p>
              <ul className="space-y-1.5">
                {runs.slice(0, 15).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={
                          "h-1.5 w-1.5 rounded-full " +
                          (r.status === "completed"
                            ? "bg-emerald-500"
                            : r.status === "failed"
                              ? "bg-destructive"
                              : "bg-amber-500")
                        }
                      />
                      {r.status}
                    </span>
                    <span className="text-muted-foreground">
                      {r.messages_sent ?? 0} msg · {r.started_at ? new Date(r.started_at).toLocaleString("pt-BR") : "—"}
                    </span>
                  </li>
                ))}
                {runs.length === 0 && (
                  <li className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-xs text-muted-foreground">
                    Sem execuções ainda.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary" | "destructive";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          "mt-0.5 font-display text-xl font-semibold " +
          (tone === "primary"
            ? "text-primary"
            : tone === "destructive"
              ? "text-destructive"
              : "")
        }
      >
        {value}
      </p>
    </div>
  );
}
