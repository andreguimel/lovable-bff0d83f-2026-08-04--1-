import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listActiveAgents,
  listActiveFlowsForCompany,
  runAgentOnConversation,
  runFlowOnConversation,
} from "@/lib/inbox.functions";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: "flows" | "agents";
  onTabChange: (tab: "flows" | "agents") => void;
  conversationId: string;
  companyId?: string;
  trigger: React.ReactNode;
}

export function FlowAgentPickerPopover({
  open,
  onOpenChange,
  tab,
  onTabChange,
  conversationId,
  companyId,
  trigger,
}: Props) {
  const qc = useQueryClient();
  const listFlowsFn = useServerFn(listActiveFlowsForCompany);
  const listAgentsFn = useServerFn(listActiveAgents);
  const runFlow = useServerFn(runFlowOnConversation);
  const runAgent = useServerFn(runAgentOnConversation);

  const { data: activeFlows = [], isLoading: loadingFlows } = useQuery({
    queryKey: ["active-flows"],
    queryFn: () => listFlowsFn(),
    enabled: open,
  });
  const { data: activeAgents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ["active-agents"],
    queryFn: () => listAgentsFn(),
    enabled: open,
  });

  const runFlowMut = useMutation({
    mutationFn: async (flowId: string) => {
      const { data: authData } = await supabase.auth.getUser();
      const triggerId = crypto.randomUUID();
      console.info("[FLOW_RUNTIME_AUDIT] InboxExecuteFlowClicked", {
        workspace_id: companyId ?? null,
        organization_id: companyId ?? null,
        conversation_id: conversationId,
        flow_id: flowId,
        trigger_id: triggerId,
        user_id: authData.user?.id ?? null,
      });
      return runFlow({ data: { conversationId, flowId, idempotencyKey: triggerId } });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(`Fluxo disparado (${r.messagesSent} mensagens)`);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAgentMut = useMutation({
    mutationFn: (agentId: string) => runAgent({ data: { conversationId, agentId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Agente respondeu");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="left"
        sideOffset={8}
        collisionPadding={12}
        className="w-80 p-2 shadow-xl"
      >
        <div className="mb-2 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Disparar automação
          </p>
        </div>
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as "flows" | "agents")}>
          <TabsList className="grid h-9 w-full grid-cols-2">
            <TabsTrigger value="flows" className="flex-1">
              <Workflow className="mr-1.5 h-3.5 w-3.5" /> Fluxos
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex-1">
              <Bot className="mr-1.5 h-3.5 w-3.5" /> Agentes IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="flows" className="mt-2 max-h-72 overflow-y-auto">
            {loadingFlows ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Carregando…</p>
            ) : activeFlows.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum fluxo ativo disponível.
              </p>
            ) : (
              <div className="space-y-1">
                {activeFlows.map((f) => (
                  <button
                    key={f.id}
                    disabled={runFlowMut.isPending}
                    onClick={() => runFlowMut.mutate(f.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-border/60 hover:bg-accent disabled:opacity-50"
                  >
                    <Workflow className="h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1 truncate">{f.name}</span>
                    {runFlowMut.isPending && runFlowMut.variables === f.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="agents" className="mt-2 max-h-72 overflow-y-auto">
            {loadingAgents ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Carregando…</p>
            ) : activeAgents.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum agente IA ativo.
              </p>
            ) : (
              <div className="space-y-1">
                {activeAgents.map((a) => (
                  <button
                    key={a.id}
                    disabled={runAgentMut.isPending}
                    onClick={() => runAgentMut.mutate(a.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-border/60 hover:bg-accent disabled:opacity-50"
                  >
                    <Bot className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{a.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{a.model}</p>
                    </div>
                    {runAgentMut.isPending && runAgentMut.variables === a.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
