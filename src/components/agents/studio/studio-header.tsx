import { Copy, History, Loader2, Play, Save, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Agent } from "@/lib/agents.functions";

export function StudioHeader({
  agent,
  saving,
  onSave,
  onTest,
  onDuplicate,
  onToggleActive,
  onOpenHistory,
}: {
  agent: Agent;
  saving?: boolean;
  onSave: () => void;
  onTest: () => void;
  onDuplicate: () => void;
  onToggleActive: (v: boolean) => void;
  onOpenHistory: () => void;
}) {
  const initials = agent.name.slice(0, 2).toUpperCase();
  return (
    <div className="studio-header flex-wrap">
      <div className="studio-avatar">{initials}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-display text-2xl font-bold">{agent.name}</h1>
          <Badge
            variant="secondary"
            className={
              agent.is_active
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground"
            }
          >
            {agent.is_active ? "Ativo" : "Pausado"}
          </Badge>
          {agent.version ? (
            <Badge variant="outline" className="text-[11px]">
              v{agent.version}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {agent.specialty || agent.role || "Assistente"}
          {agent.department ? ` · ${agent.department}` : ""} · {agent.model} · temp{" "}
          {Number(agent.temperature ?? 0.7).toFixed(1)} · {agent.language}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Ativo</span>
          <Switch checked={agent.is_active} onCheckedChange={onToggleActive} />
        </div>
        <Button size="sm" variant="secondary" onClick={onTest}>
          <Play className="mr-1 h-4 w-4" /> Testar
        </Button>
        <Button size="sm" variant="ghost" onClick={onDuplicate}>
          <Copy className="mr-1 h-4 w-4" /> Duplicar
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenHistory}>
          <History className="mr-1 h-4 w-4" /> Histórico
        </Button>
        <Button size="sm" variant="ghost" disabled title="Em breve">
          <Upload className="mr-1 h-4 w-4" /> Publicar
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>
    </div>
  );
}
