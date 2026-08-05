import { Link } from "@tanstack/react-router";
import { MessageCircle, Sparkles, MoreHorizontal, TrendingUp, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PRESENCE_LABEL } from "./constants";

export function MemberCard({ m }: { m: any }) {
  const initials = (m.full_name ?? m.email ?? "?").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <Link to="/team/$memberId" params={{ memberId: m.id }} className="member-card block">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="h-14 w-14 rounded-2xl">
            <AvatarImage src={m.avatar_url ?? undefined} />
            <AvatarFallback className="rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="presence-dot absolute -bottom-0.5 -right-0.5" data-status={m.presence.status} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-sm truncate">{m.full_name ?? m.email}</div>
            <button className="text-muted-foreground hover:text-foreground" onClick={(e) => e.preventDefault()}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground truncate">{m.job_title ?? m.role}</div>
          <div className="flex items-center gap-1.5 mt-1">
            {m.department && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: m.department.color, color: m.department.color }}>
                {m.department.name}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">· {PRESENCE_LABEL[m.presence.status] ?? m.presence.status}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
        <Stat icon={MessageCircle} label="Conversas" value={m.stats.open_conversations} />
        <Stat icon={Users} label="Clientes" value={m.stats.messages_24h} />
        <Stat icon={TrendingUp} label="Score" value={m.stats.score} />
      </div>

      {m.queues.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {m.queues.slice(0, 3).map((q: string) => (
            <span key={q} className="queue-chip">{q}</span>
          ))}
          {m.queues.length > 3 && <span className="queue-chip">+{m.queues.length - 3}</span>}
        </div>
      )}

      {m.ai_agent_id && (
        <div className="flex items-center gap-1.5 text-[11px] text-violet-500">
          <Sparkles className="h-3 w-3" /> Assistido por IA
        </div>
      )}
    </Link>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
