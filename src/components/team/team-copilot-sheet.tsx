import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, Send } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runTeamCopilot } from "@/lib/team-studio.functions";

const QUICK = [
  { id: "diagnose", label: "🩺 Diagnóstico da equipe" },
  { id: "departments", label: "🏢 Sugerir departamentos" },
  { id: "queues", label: "📋 Balancear filas" },
  { id: "invites", label: "✉️ Destravar convites" },
] as const;

export function TeamCopilotSheet({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [output, setOutput] = useState<string | null>(null);

  const fn = useServerFn(runTeamCopilot);
  const mut = useMutation({
    mutationFn: (payload: { action: "diagnose" | "departments" | "queues" | "invites" | "ask"; question?: string }) =>
      fn({ data: payload }),
    onSuccess: (r: any) => setOutput(r.output),
    onError: (e: Error) => toast.error(e.message ?? "Falha no Copiloto"),
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Copiloto da Equipe
          </SheetTitle>
          <SheetDescription>Análise inteligente e sugestões para gestão da sua equipe.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {QUICK.map((a) => (
              <Button
                key={a.id}
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                disabled={mut.isPending}
                onClick={() => { setOutput(null); mut.mutate({ action: a.id }); }}
              >
                {a.label}
              </Button>
            ))}
          </div>

          <div className="rounded-xl border border-border/60 p-3 space-y-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Pergunte algo sobre a equipe… (ex: 'como distribuir melhor os operadores?')"
              className="min-h-20 text-sm"
              disabled={mut.isPending}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!question.trim() || mut.isPending}
                onClick={() => { setOutput(null); mut.mutate({ action: "ask", question: question.trim() }); }}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" /> Perguntar
              </Button>
            </div>
          </div>

          {mut.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 rounded-xl bg-muted/30">
              <Loader2 className="h-4 w-4 animate-spin" /> Copiloto analisando…
            </div>
          )}

          {output && !mut.isPending && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 whitespace-pre-wrap text-sm leading-relaxed">
              {output}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
