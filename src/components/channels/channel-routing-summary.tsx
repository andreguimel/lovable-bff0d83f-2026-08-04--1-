import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { getChannelRouting } from "@/lib/channels.functions";

export function RoutingSummary({ channelId }: { channelId: string }) {
  const getRouting = useServerFn(getChannelRouting);
  const { data } = useQuery({
    queryKey: ["channel-routing", channelId],
    queryFn: () => getRouting({ data: { channelId } }),
  });

  const dept = data?.departments.find((d: any) => d.id === data.channel.department_id);
  const assignedIds = new Set(data?.assignedMemberIds ?? []);
  const assigned = (data?.members ?? []).filter((m: any) => assignedIds.has(m.user_id));

  return (
    <>
      <div className="rounded-xl border p-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Building2 className="h-3 w-3" /> Setor
        </p>
        <p className="mt-1 text-sm font-semibold">
          {dept ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: dept.color ?? "#3B82F6" }} />
              {dept.name}
            </span>
          ) : (
            <span className="text-muted-foreground font-normal">Não definido</span>
          )}
        </p>
      </div>
      <div className="rounded-xl border p-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3 w-3" /> Equipe responsável
        </p>
        <div className="mt-1 min-h-[20px]">
          {assigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum membro atribuído</p>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-2">
                {assigned.slice(0, 3).map((m: any) => (
                  <Avatar key={m.user_id} className="h-6 w-6 border-2 border-background">
                    <AvatarImage src={m.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[9px]">
                      {(m.full_name ?? m.email ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <span className="text-sm font-semibold">
                {assigned[0]?.full_name?.split(" ")[0] ?? assigned[0]?.email}
                {assigned.length > 1 && ` +${assigned.length - 1}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
