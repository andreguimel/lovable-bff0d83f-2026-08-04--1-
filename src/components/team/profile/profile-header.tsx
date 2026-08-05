import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MessageCircle, Calendar, Sparkles, Edit3 } from "lucide-react";
import { PRESENCE_LABEL } from "../constants";

export function ProfileHeader({ profile, extension, role, presence, onEdit, onMessage }: any) {
  const initials = (profile.full_name ?? profile.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="studio-header">
      <div className="relative">
        <Avatar className="h-20 w-20 rounded-2xl">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback className="rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground font-bold text-2xl">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="presence-dot absolute bottom-0 right-0" data-status={presence?.status ?? "offline"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-bold truncate">{profile.full_name ?? profile.email}</h1>
          <Badge variant="outline" className="text-[10px]">{role}</Badge>
          <span className="text-xs text-muted-foreground">· {PRESENCE_LABEL[presence?.status] ?? "Offline"}</span>
        </div>
        <div className="text-sm text-muted-foreground">{extension?.job_title ?? "—"}</div>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {profile.email}</span>
          {extension?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {extension.phone}</span>}
          {extension?.whatsapp && <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {extension.whatsapp}</span>}
          {extension?.hire_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> desde {new Date(extension.hire_date).toLocaleDateString("pt-BR")}</span>}
          {extension?.ai_agent_id && <span className="inline-flex items-center gap-1 text-violet-500"><Sparkles className="h-3 w-3" /> IA vinculada</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button size="sm" variant="outline" onClick={onMessage}><MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Mensagem</Button>
        <Button size="sm" variant="outline" onClick={onEdit}><Edit3 className="h-3.5 w-3.5 mr-1.5" /> Editar</Button>
      </div>
    </div>
  );
}
