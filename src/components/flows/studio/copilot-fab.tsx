import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Bug,
  FileText,
  Loader2,
  Sparkles,
  TrendingUp,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  generateFlowWithAI,
  runFlowCopilotAction,
} from "@/lib/flow-studio.functions";
import type { CanonicalBlockKind } from "@/features/flow-builder/blocks/kinds";

export interface AIFlowPatch {
  nodes: Array<{
    id: string;
    node_type: CanonicalBlockKind;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    source_handle: string | null;
    label: string | null;
  }>;
}

interface Props {
  flowId: string;
  onApply: (patch: AIFlowPatch) => void;
  contextSummary: string;
}

type CopilotAction = "improve" | "loops" | "optimize" | "document";

const ACTIONS: {
  id: CopilotAction;
  label: string;
  icon: typeof Wand2;
  hint: string;
}[] = [
  { id: "improve", label: "Melhorar fluxo", icon: Wand2, hint: "Sugestões de UX e mensagens" },
  { id: "loops", label: "Detectar loops", icon: Bug, hint: "Verifica ciclos e nós órfãos" },
  { id: "optimize", label: "Otimizar performance", icon: TrendingUp, hint: "Reduz passos e custos" },
  { id: "document", label: "Documentar fluxo", icon: FileText, hint: "Cria descrição estruturada" },
];

export function CopilotFab({ flowId, onApply, contextSummary }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "generate" | "result">("menu");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string>("");

  const generateFn = useServerFn(generateFlowWithAI);
  const actionFn = useServerFn(runFlowCopilotAction);

  const gen = useMutation({
    mutationFn: (p: string) => generateFn({ data: { prompt: p, flowId } }),
    onSuccess: (r: AIFlowPatch) => {
      onApply(r);
      toast.success("Fluxo gerado — revise antes de salvar.");
      setOpen(false);
      setMode("menu");
      setPrompt("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na IA"),
  });

  const act = useMutation({
    mutationFn: (action: CopilotAction) =>
      actionFn({ data: { action, context: contextSummary } }),
    onSuccess: (r: { output: string }) => {
      setResult(r.output);
      setMode("result");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na IA"),
  });

  if (!open) {
    return (
      <button
        type="button"
        className="copilot-fab"
        onClick={() => setOpen(true)}
        aria-label="Copiloto IA"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="copilot-fab-panel">
      <header className="copilot-fab-panel__head">
        <span className="copilot-fab-panel__icon">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Copiloto de Fluxos</p>
          <p className="text-[11px] text-muted-foreground">
            Gera, revisa e documenta com IA
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            setOpen(false);
            setMode("menu");
            setResult("");
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {mode === "menu" && (
        <div className="copilot-fab-panel__body">
          <button
            type="button"
            className="copilot-action copilot-action--hero"
            onClick={() => setMode("generate")}
          >
            <span className="copilot-action__icon">
              <Zap className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Criar fluxo com IA</p>
              <p className="text-[11px] opacity-80">
                Descreva o objetivo e a IA monta o fluxo completo.
              </p>
            </div>
          </button>

          <div className="copilot-fab-panel__grid">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  className="copilot-action"
                  onClick={() => act.mutate(a.id)}
                  disabled={act.isPending}
                >
                  <span className="copilot-action__icon">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{a.label}</p>
                    <p className="line-clamp-1 text-[10px] text-muted-foreground">{a.hint}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {act.isPending && (
            <p className="flex items-center justify-center gap-2 pt-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> processando…
            </p>
          )}
        </div>
      )}

      {mode === "generate" && (
        <div className="copilot-fab-panel__body">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Crie um fluxo para recuperar clientes que abandonaram o orçamento, oferecendo desconto e transferindo para vendedor quando aceitarem."
            rows={5}
            className="resize-none text-sm"
          />
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode("menu")}>
              Voltar
            </Button>
            <Button
              size="sm"
              onClick={() => gen.mutate(prompt)}
              disabled={!prompt.trim() || gen.isPending}
              className="gap-1"
            >
              {gen.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Gerar fluxo
            </Button>
          </div>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <BadgeCheck className="h-3 w-3" /> substitui o canvas atual — pode desfazer com Ctrl+Z.
          </p>
        </div>
      )}

      {mode === "result" && (
        <div className="copilot-fab-panel__body">
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed">
            {result}
          </pre>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setMode("menu")}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
