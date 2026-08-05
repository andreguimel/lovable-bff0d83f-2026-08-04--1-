import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { runPlaygroundMessage } from "@/lib/agent-studio.functions";
import type { Agent } from "@/lib/agents.functions";

type Msg = { role: "user" | "assistant"; content: string };

export function PlaygroundDrawer({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent: Agent;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [temperature, setTemperature] = useState<number>(Number(agent.temperature ?? 0.7));
  const [meta, setMeta] = useState<{
    latencyMs?: number;
    tokensIn?: number | null;
    tokensOut?: number | null;
    model?: string;
  } | null>(null);

  const mut = useMutation({
    mutationFn: (text: string) =>
      runPlaygroundMessage({
        data: { agentId: agent.id, message: text, history: messages, temperature },
      }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.output }]);
      setMeta({
        latencyMs: res.latencyMs,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        model: res.model,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function send() {
    const text = input.trim();
    if (!text || mut.isPending) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    mut.mutate(text);
  }

  function reset() {
    setMessages([]);
    setMeta(null);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center justify-between gap-2">
            <span className="truncate">Playground — {agent.name}</span>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="grid flex-1 grid-cols-[1fr_220px] overflow-hidden">
          <div className="flex flex-col overflow-hidden">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="mx-auto max-w-xs pt-8 text-center text-sm text-muted-foreground">
                  Envie uma mensagem para testar o agente em tempo real.
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
                  }
                >
                  {m.content}
                </div>
              ))}
              {mut.isPending && (
                <div className="mr-auto flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Pensando…
                </div>
              )}
            </div>
            <div className="border-t p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Escreva uma mensagem…"
                  rows={2}
                  className="min-h-0 resize-none"
                />
                <Button onClick={send} disabled={mut.isPending || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="playground-panel overflow-y-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Parâmetros
            </p>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span>Temperatura</span>
                <span className="text-muted-foreground">{temperature.toFixed(1)}</span>
              </div>
              <Slider
                value={[temperature * 100]}
                max={200}
                step={5}
                onValueChange={(v) => setTemperature(v[0] / 100)}
              />
            </div>
            <div className="rounded-lg border bg-card p-2 text-[11px]">
              <p className="text-muted-foreground">Modelo</p>
              <p className="truncate font-medium">{meta?.model ?? agent.model}</p>
            </div>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Última execução
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Stat label="Latência" value={meta?.latencyMs ? `${meta.latencyMs}ms` : "—"} />
              <Stat label="Tokens in" value={String(meta?.tokensIn ?? "—")} />
              <Stat label="Tokens out" value={String(meta?.tokensOut ?? "—")} />
              <Stat label="Msgs" value={String(messages.length)} />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
