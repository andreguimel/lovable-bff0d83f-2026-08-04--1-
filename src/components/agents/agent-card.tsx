import { Link } from "@tanstack/react-router";
import { Copy, MoreHorizontal, Play, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Agent } from "@/lib/agents.functions";

type Metric = { label: string; value: string };

export function AgentCard({
  agent,
  metrics,
  onToggle,
  onDelete,
  onDuplicate,
  onTest,
}: {
  agent: Agent;
  metrics?: Metric[];
  onToggle: (v: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTest: () => void;
}) {
  const initials = agent.name.slice(0, 2).toUpperCase();
  const active = agent.is_active;
  return (
    <div className="agent-card group">
      <div className="flex items-start gap-3">
        <div className="studio-avatar h-14 w-14 rounded-2xl text-lg">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to="/agents/$agentId"
              params={{ agentId: agent.id }}
              className="truncate font-display text-base font-semibold hover:underline"
            >
              {agent.name}
            </Link>
            <Badge
              variant="secondary"
              className={
                active
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground"
              }
            >
              {active ? "Ativo" : "Pausado"}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {agent.specialty || agent.role || "Assistente"}
            {agent.department ? ` · ${agent.department}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-muted px-1.5 py-0.5">{agent.model}</span>
            <span>temp {Number(agent.temperature ?? 0.7).toFixed(1)}</span>
            {agent.version ? <span>· v{agent.version}</span> : null}
          </div>
        </div>
        <Switch checked={active} onCheckedChange={onToggle} />
      </div>

      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {agent.prompt?.trim() || "Sem instruções configuradas."}
      </p>

      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 rounded-xl border bg-muted/30 p-2">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-0">
              <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.label}
              </p>
              <p className="truncate text-sm font-semibold">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={onTest} className="h-8">
            <Play className="mr-1 h-3.5 w-3.5" /> Testar
          </Button>
          <Link to="/agents/$agentId" params={{ agentId: agent.id }}>
            <Button size="sm" variant="ghost" className="h-8">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Editar
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDuplicate} title="Duplicar">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDelete} title="Excluir">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Mais">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
