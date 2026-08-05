import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runCopilotAction } from "@/lib/agent-studio.functions";

const ACTIONS = [
  { id: "improve", label: "✨ Melhorar Prompt" },
  { id: "conflicts", label: "🔎 Detectar conflitos" },
  { id: "optimize", label: "🪶 Otimizar tokens" },
  { id: "simulate", label: "🧪 Simular atendimento" },
  { id: "conversion", label: "📈 Melhorar conversão" },
] as const;

export function CopilotFab({
  agentName,
  getPrompt,
  onApply,
}: {
  agentName: string;
  getPrompt: () => string;
  onApply: (result: string, action: (typeof ACTIONS)[number]["id"]) => void;
}) {
  const [result, setResult] = useState<{ text: string; action: string } | null>(null);

  const mut = useMutation({
    mutationFn: (action: (typeof ACTIONS)[number]["id"]) =>
      runCopilotAction({ data: { action, prompt: getPrompt(), agentName } }).then((r) => ({
        r,
        action,
      })),
    onSuccess: ({ r, action }) => setResult({ text: r.output, action }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="ai-copilot-fab" disabled={mut.isPending}>
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Copiloto IA
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {ACTIONS.map((a) => (
            <DropdownMenuItem
              key={a.id}
              onClick={() => mut.mutate(a.id)}
              disabled={mut.isPending}
            >
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {result && (
        <div className="fixed bottom-24 right-6 z-50 w-[min(420px,90vw)] rounded-2xl border bg-card p-4 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Copiloto IA
            </p>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setResult(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm">
            {result.text}
          </div>
          {(result.action === "improve" || result.action === "optimize") && (
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                Descartar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onApply(result.text, result.action as (typeof ACTIONS)[number]["id"]);
                  setResult(null);
                }}
              >
                Aplicar ao prompt
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
