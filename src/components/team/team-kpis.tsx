import { Users2, Sparkles, MessageCircle, Clock, CheckCircle2, Megaphone, Workflow, Mail, Circle, CircleOff } from "lucide-react";

const ICONS: Record<string, any> = {
  online: Circle, offline: CircleOff, active_agents: Sparkles,
  in_conversation: MessageCircle, waiting: Clock, avg_response: Clock,
  resolved_today: CheckCircle2, running_campaigns: Megaphone,
  active_flows: Workflow, pending_invites: Mail,
};

const CFG: { key: string; label: string; color?: string }[] = [
  { key: "online", label: "Online", color: "text-emerald-500" },
  { key: "offline", label: "Offline", color: "text-slate-400" },
  { key: "active_agents", label: "Agentes IA ativos", color: "text-violet-500" },
  { key: "in_conversation", label: "Em atendimento", color: "text-sky-500" },
  { key: "waiting", label: "Aguardando", color: "text-amber-500" },
  { key: "avg_response", label: "Tempo médio", color: "text-primary" },
  { key: "resolved_today", label: "Resolvidos hoje", color: "text-emerald-500" },
  { key: "running_campaigns", label: "Campanhas", color: "text-pink-500" },
  { key: "active_flows", label: "Fluxos ativos", color: "text-indigo-500" },
  { key: "pending_invites", label: "Convites", color: "text-orange-500" },
];

export function TeamKpis({ kpis }: { kpis: Record<string, any> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {CFG.map((k) => {
        const Icon = ICONS[k.key] ?? Users2;
        const value = kpis?.[k.key] ?? 0;
        return (
          <div key={k.key} className="studio-kpi">
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${k.color ?? "text-primary"}`} />
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
          </div>
        );
      })}
    </div>
  );
}
