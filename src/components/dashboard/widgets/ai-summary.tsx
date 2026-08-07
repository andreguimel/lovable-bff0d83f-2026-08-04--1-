import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { WidgetEmpty } from "@/components/dashboard/shell/widget-empty";
import { generateDailySummary, getLatestDailySummary } from "@/lib/analytics.functions";

export default function AiSummaryWidget() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const fetchSummary = useServerFn(generateDailySummary);
  const loadLatestFn = useServerFn(getLatestDailySummary);

  const { data: latestData, isLoading: loadingInitial } = useQuery({
    queryKey: ["latest-ai-summary"],
    queryFn: () => loadLatestFn(),
  });

  const summary = latestData?.summary ?? null;
  const generatedAt = latestData?.generatedAt ?? null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      await fetchSummary();
      await qc.invalidateQueries({ queryKey: ["latest-ai-summary"] });
      toast.success("Resumo gerado com sucesso!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar resumo";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            IA da plataforma
          </div>
          {generatedAt && (
            <span className="text-[10px] text-muted-foreground">
              Atualizado às {new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          Peça um resumo inteligente do seu dia. A IA analisa suas conversas, fluxos, campanhas e
          cascatas para destacar o que exige sua atenção agora.
        </p>
        <Button size="sm" className="mt-3 gap-1.5" onClick={handleGenerate} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Gerando resumo...
            </>
          ) : summary ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar resumo
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Gerar resumo
            </>
          )}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/40 bg-card/40 p-4">
        {loading || loadingInitial ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">
              {loading ? "Analisando dados do atendimento..." : "Carregando resumo salvo..."}
            </p>
          </div>
        ) : summary ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {summary}
          </div>
        ) : (
          <WidgetEmpty
            icon={Sparkles}
            title="Aguardando primeiro resumo"
            description="Clique em Gerar resumo para uma análise do seu dia."
          />
        )}
      </div>
    </div>
  );
}

