import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runPlaygroundMessage } from "@/lib/agent-studio.functions";
import type { Agent } from "@/lib/agents.functions";

type Msg = { role: "user" | "assistant"; content: string };

export function MobilePlayground({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const mut = useMutation({
    mutationFn: (text: string) =>
      runPlaygroundMessage({
        data: {
          agentId: agent.id,
          message: text,
          history: messages,
          temperature: Number(agent.temperature ?? 0.7),
        },
      }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.output }]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mut.isPending]);

  function send() {
    const text = input.trim();
    if (!text || mut.isPending) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    mut.mutate(text);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Playground</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {agent.name} · {agent.model}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !mut.isPending && (
          <div className="mx-auto max-w-xs pt-16 text-center text-sm text-muted-foreground">
            Envie uma mensagem para conversar com {agent.name}.
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

      <div
        className="border-t bg-background p-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
      >
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
            rows={1}
            className="max-h-32 min-h-11 resize-none rounded-2xl"
          />
          <Button
            size="icon"
            onClick={send}
            disabled={mut.isPending || !input.trim()}
            className="h-11 w-11 shrink-0 rounded-2xl"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
