import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WidgetEmpty } from "@/components/dashboard/shell/widget-empty";

/**
 * Widget "Resumo Inteligente" — stub estruturado. Fase 2 conecta ao AI Gateway
 * para gerar um summary diário/horário baseado nas métricas do dia.
 */
export default function AiSummaryWidget() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" />
          IA da plataforma
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          Peça um resumo inteligente do seu dia. A IA analisa suas conversas, fluxos, campanhas e
          cascatas para destacar o que exige sua atenção agora.
        </p>
        <Button size="sm" className="mt-3 gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Gerar resumo
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <WidgetEmpty
          icon={Sparkles}
          title="Aguardando primeiro resumo"
          description="Clique em Gerar resumo para uma análise do seu dia."
        />
      </div>
    </div>
  );
}
