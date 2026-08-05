import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, RefreshCw, TrendingUp, AlertCircle, Clock, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateContactAIInsights } from "@/lib/crm-hub.functions";
import { ClientTime } from "@/components/client-time";

type Insights = {
  summary?: string;
  sentiment?: string;
  interest?: string;
  objections?: string[];
  probability?: number;
  best_time?: string;
  next_action?: string;
  suggested_reply?: string;
  risk?: string;
  generated_at?: string;
};

export function IATab({ contactId, cached }: { contactId: string; cached: Insights | null }) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateContactAIInsights);

  const gen = useMutation({
    mutationFn: () => genFn({ data: { contactId } }),
    onSuccess: () => {
      toast.success("Insights atualizados");
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data: Insights = (gen.data as Insights | undefined) ?? cached ?? {};
  const hasData = !!data.summary;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Insights com IA</h3>
          {data.generated_at && (
            <span className="text-[11px] text-muted-foreground">
              atualizado <ClientTime iso={data.generated_at} />
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => gen.mutate()} disabled={gen.isPending}>
          {gen.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          {hasData ? "Atualizar" : "Gerar insights"}
        </Button>
      </div>

      {!hasData && !gen.isPending && (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
          <p className="text-sm font-medium">Sem análise ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clique em “Gerar insights” para a IA analisar este cliente.
          </p>
        </div>
      )}

      {hasData && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Resumo" icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}>
            <p className="text-sm leading-relaxed">{data.summary}</p>
          </Card>

          <Card title="Sinais" icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}>
            <div className="flex flex-wrap gap-2 text-xs">
              {data.sentiment && (
                <Badge variant="secondary">Sentimento: {data.sentiment}</Badge>
              )}
              {data.interest && <Badge variant="secondary">Interesse: {data.interest}</Badge>}
              {typeof data.probability === "number" && (
                <Badge variant="secondary">Probabilidade: {data.probability}%</Badge>
              )}
            </div>
          </Card>

          {data.next_action && (
            <Card title="Próxima ação" icon={<Clock className="h-3.5 w-3.5 text-primary" />}>
              <p className="text-sm">{data.next_action}</p>
            </Card>
          )}

          {data.best_time && (
            <Card title="Melhor horário" icon={<Clock className="h-3.5 w-3.5 text-primary" />}>
              <p className="text-sm">{data.best_time}</p>
            </Card>
          )}

          {data.suggested_reply && (
            <Card
              title="Resposta sugerida"
              icon={<MessageCircle className="h-3.5 w-3.5 text-primary" />}
              className="md:col-span-2"
            >
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
                {data.suggested_reply}
              </p>
            </Card>
          )}

          {data.objections && data.objections.length > 0 && (
            <Card
              title="Objeções possíveis"
              icon={<AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
              className="md:col-span-2"
            >
              <ul className="list-disc space-y-1 pl-4 text-sm">
                {data.objections.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </Card>
          )}

          {data.risk && (
            <Card
              title="Risco"
              icon={<AlertCircle className="h-3.5 w-3.5 text-destructive" />}
              className="md:col-span-2"
            >
              <p className="text-sm">{data.risk}</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  icon,
  className,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={"rounded-xl border border-border/40 bg-card p-4 " + (className ?? "")}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
