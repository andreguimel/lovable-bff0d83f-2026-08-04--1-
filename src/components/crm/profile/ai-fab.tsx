import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runQuickAI } from "@/lib/crm-hub.functions";

type QuickAIAction =
  | "resumir"
  | "proposta"
  | "responder"
  | "email"
  | "tarefa"
  | "followup"
  | "analisar"
  | "contrato"
  | "objecoes";

const ACTIONS: Array<{ id: QuickAIAction; label: string }> = [
  { id: "resumir", label: "Resumir cliente" },
  { id: "proposta", label: "Criar proposta" },
  { id: "responder", label: "Responder mensagem" },
  { id: "email", label: "Criar e-mail" },
  { id: "tarefa", label: "Criar tarefa" },
  { id: "followup", label: "Gerar follow-up" },
  { id: "analisar", label: "Analisar lead" },
  { id: "contrato", label: "Estruturar contrato" },
  { id: "objecoes", label: "Responder objeções" },
];

export function AIFab({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<QuickAIAction | null>(null);
  const runFn = useServerFn(runQuickAI);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["quick-ai", contactId, action],
    queryFn: () => runFn({ data: { contactId, action: action! } }),
    enabled: !!action,
    staleTime: 60_000,
  });

  const trigger = (id: QuickAIAction) => {
    setAction(id);
    setOpen(true);
    qc.invalidateQueries({ queryKey: ["quick-ai", contactId, id] });
  };

  const currentLabel = ACTIONS.find((a) => a.id === action)?.label ?? "";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="ai-fab" type="button">
            <Sparkles className="h-4 w-4" />
            IA
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5" /> Ações inteligentes
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ACTIONS.map((a) => (
            <DropdownMenuItem key={a.id} onClick={() => trigger(a.id)}>
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-4 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {currentLabel}
            </SheetTitle>
            <SheetDescription>Gerado pela IA a partir do contexto do cliente.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
            {query.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
              </div>
            ) : query.isError ? (
              <p className="text-destructive">{(query.error as Error).message}</p>
            ) : (
              <pre className="whitespace-pre-wrap font-sans leading-relaxed text-foreground">
                {query.data?.text}
              </pre>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!query.data?.text}
              onClick={() => {
                navigator.clipboard.writeText(query.data?.text ?? "");
                toast.success("Copiado!");
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
            </Button>
            <Button
              size="sm"
              onClick={() => action && qc.invalidateQueries({ queryKey: ["quick-ai", contactId, action] })}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Gerar novamente
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
