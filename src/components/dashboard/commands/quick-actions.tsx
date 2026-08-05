import { Bot, MessageSquarePlus, Send, UserPlus, Workflow, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { icon: MessageSquarePlus, label: "Nova conversa", to: "/inbox" as const, tone: "text-sky-500" },
  { icon: UserPlus, label: "Novo contato", to: "/crm" as const, tone: "text-violet-500" },
  { icon: Workflow, label: "Criar fluxo", to: "/flows" as const, tone: "text-amber-500" },
  { icon: Bot, label: "Novo agente IA", to: "/agents" as const, tone: "text-emerald-500" },
  { icon: Send, label: "Nova campanha", to: "/campaigns" as const, tone: "text-rose-500" },
  { icon: Zap, label: "Nova automação", to: "/cascades" as const, tone: "text-indigo-500" },
] as const;

export function QuickActions({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {ACTIONS.map((a) => (
        <Button
          key={a.label}
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 rounded-full border border-border/50 bg-background/60 px-3 text-xs font-medium hover:bg-accent"
          onClick={() => router.navigate({ to: a.to })}
        >
          <a.icon className={cn("h-3.5 w-3.5", a.tone)} />
          {a.label}
        </Button>
      ))}
    </div>
  );
}
