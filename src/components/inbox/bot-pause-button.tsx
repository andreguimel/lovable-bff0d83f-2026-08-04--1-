import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Play, Pause, Infinity as InfinityIcon, Clock, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  getConversationBotPause,
  setConversationBotPause,
} from "@/lib/inbox.functions";

const PRESETS: { label: string; minutes: number }[] = [
  { label: "15 minutos", minutes: 15 },
  { label: "30 minutos", minutes: 30 },
  { label: "1 hora", minutes: 60 },
  { label: "4 horas", minutes: 240 },
  { label: "24 horas", minutes: 60 * 24 },
];

function formatRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expirando…";
  const y = new Date(iso).getUTCFullYear();
  if (y >= 2999) return "indefinidamente";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h`;
  const days = Math.round(hrs / 24);
  return `${days} d`;
}

export function BotPauseButton({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const getFn = useServerFn(getConversationBotPause);
  const setFn = useServerFn(setConversationBotPause);

  const { data } = useQuery({
    queryKey: ["conversation-bot-pause", conversationId],
    queryFn: () => getFn({ data: { conversationId } }),
    refetchInterval: 30_000,
  });

  const pausedUntil = data?.bot_paused_until ?? null;
  const isPaused =
    !!pausedUntil && new Date(pausedUntil).getTime() > Date.now();
  const isIndefinite = isPaused && new Date(pausedUntil!).getUTCFullYear() >= 2999;

  const mut = useMutation({
    mutationFn: (minutes: number | null) => setFn({ data: { conversationId, minutes } }),
    onSuccess: (_res, minutes) => {
      qc.invalidateQueries({ queryKey: ["conversation-bot-pause", conversationId] });
      setOpen(false);
      if (minutes === 0) toast.success("Automação retomada");
      else if (minutes === null) toast.success("Automação pausada indefinidamente");
      else toast.success(`Automação pausada por ${minutes} min`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={isPaused ? "outline" : "outline"}
          className={cn(
            "h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs font-medium",
            isPaused && "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15",
          )}
          title={isPaused ? "Automação pausada" : "Automação ativa"}
        >
          <Bot className="h-3.5 w-3.5" />
          Bot
          {isPaused && (
            <span className="ml-0.5 inline-flex items-center gap-1">
              <Pause className="h-3 w-3" />
              <span className="text-[10px] font-semibold">
                {isIndefinite ? "∞" : formatRemaining(pausedUntil!)}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="mb-2 px-2 pt-1">
          <p className="text-sm font-semibold">Automação do fluxo / agente</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isPaused
              ? isIndefinite
                ? "Pausada indefinidamente"
                : `Pausada por mais ${formatRemaining(pausedUntil!)}`
              : "Ativa — respondendo automaticamente"}
          </p>
        </div>

        {isPaused && (
          <button
            disabled={mut.isPending}
            onClick={() => mut.mutate(0)}
            className="mb-1 flex w-full items-center gap-2 rounded-md bg-success/10 px-2.5 py-2 text-left text-[13px] font-medium text-success hover:bg-success/15 disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> Retomar automação
          </button>
        )}

        <div className="mb-1 mt-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Pausar por…
        </div>
        <div className="space-y-0.5">
          {PRESETS.map((p) => {
            const active =
              isPaused &&
              !isIndefinite &&
              Math.abs(
                new Date(pausedUntil!).getTime() -
                  (Date.now() + p.minutes * 60_000),
              ) <
                60_000;
            return (
              <button
                key={p.minutes}
                disabled={mut.isPending}
                onClick={() => mut.mutate(p.minutes)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-accent disabled:opacity-50",
                  active && "bg-accent",
                )}
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1">{p.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
          <button
            disabled={mut.isPending}
            onClick={() => mut.mutate(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-accent disabled:opacity-50",
              isIndefinite && "bg-accent",
            )}
          >
            <InfinityIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">Indefinidamente</span>
            {isIndefinite && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
