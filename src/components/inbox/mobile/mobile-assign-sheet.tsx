import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, User as UserIcon, X } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assignConversation, listActiveAgents, listCompanyMembers } from "@/lib/inbox.functions";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  assignedType: "unassigned" | "agent_user" | "ai_agent";
  assignedUserId: string | null;
  assignedAgentId: string | null;
}

export function MobileAssignSheet({
  open,
  onOpenChange,
  conversationId,
  assignedType,
  assignedUserId,
  assignedAgentId,
}: Props) {
  const qc = useQueryClient();
  const assignConv = useServerFn(assignConversation);
  const listMembersFn = useServerFn(listCompanyMembers);
  const listAgentsFn = useServerFn(listActiveAgents);

  const { data: members = [] } = useQuery({
    queryKey: ["company-members"],
    queryFn: () => listMembersFn(),
    enabled: open,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["active-agents"],
    queryFn: () => listAgentsFn(),
    enabled: open,
  });

  const assignMut = useMutation({
    mutationFn: (input: { mode: "unassigned" | "user" | "agent"; userId?: string | null; agentId?: string | null }) =>
      assignConv({ data: { conversationId, ...input } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(r.mode === "unassigned" ? "Atribuição removida" : `Atribuído a ${r.label}`);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]">
        <SheetHeader>
          <SheetTitle>Atribuir conversa</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue={assignedType === "ai_agent" ? "agents" : "users"} className="mt-3">
          <TabsList className="w-full">
            <TabsTrigger value="users" className="flex-1">
              <UserIcon className="mr-1.5 h-4 w-4" /> Humano
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex-1">
              <Bot className="mr-1.5 h-4 w-4" /> IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-3 max-h-[50vh] overflow-y-auto">
            {members.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : (
              members.map((m) => (
                <button
                  key={m.id}
                  disabled={assignMut.isPending}
                  onClick={() => assignMut.mutate({ mode: "user", userId: m.id })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-accent disabled:opacity-50",
                    assignedUserId === m.id && "bg-accent",
                  )}
                >
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-[13px] font-bold text-primary">
                    {(m.full_name ?? m.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{m.full_name ?? m.email ?? "—"}</p>
                    {m.email && <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>}
                  </div>
                </button>
              ))
            )}
          </TabsContent>

          <TabsContent value="agents" className="mt-3 max-h-[50vh] overflow-y-auto">
            {agents.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhum agente ativo.</p>
            ) : (
              agents.map((a) => (
                <button
                  key={a.id}
                  disabled={assignMut.isPending}
                  onClick={() => assignMut.mutate({ mode: "agent", agentId: a.id })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-accent disabled:opacity-50",
                    assignedAgentId === a.id && "bg-accent",
                  )}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
                    <Bot className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{a.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{a.model}</p>
                  </div>
                </button>
              ))
            )}
          </TabsContent>
        </Tabs>

        {assignedType !== "unassigned" && (
          <button
            disabled={assignMut.isPending}
            onClick={() => assignMut.mutate({ mode: "unassigned" })}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 py-2.5 text-sm text-muted-foreground active:bg-accent disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Remover atribuição
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}
