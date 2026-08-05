import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Boxes,
  Brain,
  History,
  ListTree,
  MessageSquare,
  Plug,
  Play,
  Settings2,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getAgent,
  upsertAgent,
  deleteAgent,
  type Agent,
} from "@/lib/agents.functions";
import { duplicateAgent } from "@/lib/agent-studio.functions";
import { DEFAULT_AGENT_MODEL } from "@/lib/agents.constants";
import { StudioHeader } from "@/components/agents/studio/studio-header";
import { KpiStrip } from "@/components/agents/studio/kpi-strip";
import { StudioTabsNav, type StudioTabId } from "@/components/agents/studio/tabs-nav";
import { GeneralTab } from "@/components/agents/studio/tabs/general-tab";
import { ToolsTab } from "@/components/agents/studio/tabs/tools-tab";
import { PlaceholderTab } from "@/components/agents/studio/tabs/placeholder-tab";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileAgentDetail } from "@/components/agents/mobile/mobile-agent-detail";

const PromptTab = lazy(() =>
  import("@/components/agents/studio/tabs/prompt-tab").then((m) => ({ default: m.PromptTab })),
);
const KnowledgeTab = lazy(() =>
  import("@/components/agents/studio/tabs/knowledge-tab").then((m) => ({
    default: m.KnowledgeTab,
  })),
);
const LogsTab = lazy(() =>
  import("@/components/agents/studio/tabs/logs-tab").then((m) => ({ default: m.LogsTab })),
);
const PlaygroundDrawer = lazy(() =>
  import("@/components/agents/studio/playground-drawer").then((m) => ({
    default: m.PlaygroundDrawer,
  })),
);
const CopilotFab = lazy(() =>
  import("@/components/agents/studio/copilot-fab").then((m) => ({ default: m.CopilotFab })),
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  loader: async ({ params }) => {
    if (!UUID_RE.test(params.agentId)) throw notFound();
    try {
      const agent = await getAgent({ data: { id: params.agentId } });
      return { agent };
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${(loaderData as { agent: Agent }).agent.name} — AI Studio`
          : "AI Studio",
      },
    ],
  }),
  component: AgentRoute,
});

function AgentRoute() {
  const { agent } = Route.useLoaderData() as { agent: Agent };
  const isMobile = useIsMobile();
  return isMobile ? <MobileAgentDetail initial={agent} /> : <AgentPage />;
}

function AgentPage() {
  const { agent: initial } = Route.useLoaderData() as { agent: Agent };
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<Agent>(initial);
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setForm((f) => ({ ...f, [k]: v }));

  const [tab, setTab] = useState<StudioTabId>("geral");
  const [playgroundOpen, setPlaygroundOpen] = useState(false);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertAgent({
        data: {
          id: form.id,
          name: form.name,
          role: form.role,
          prompt: form.prompt,
          personality: form.personality,
          greeting: form.greeting,
          model: form.model || DEFAULT_AGENT_MODEL,
          temperature: Number(form.temperature),
          language: form.language || "pt-BR",
          channel_ids: form.channel_ids ?? [],
          enabled_tools: form.enabled_tools ?? [],
          max_turns: form.max_turns ?? 6,
          is_active: form.is_active,
        },
      }),
    onSuccess: (row) => {
      toast.success("Agente salvo");
      if (row) setForm(row as Agent);
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAgent({ data: { id: form.id } }),
    onSuccess: () => {
      toast.success("Agente excluído");
      qc.invalidateQueries({ queryKey: ["agents"] });
      navigate({ to: "/agents" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: () => duplicateAgent({ data: { id: form.id } }),
    onSuccess: (row) => {
      toast.success("Cópia criada");
      qc.invalidateQueries({ queryKey: ["agents"] });
      const id = (row as { id?: string } | null)?.id;
      if (id) navigate({ to: "/agents/$agentId", params: { agentId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Link
        to="/agents"
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> AI Studio
      </Link>

      <StudioHeader
        agent={form}
        saving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onTest={() => setPlaygroundOpen(true)}
        onDuplicate={() => duplicateMut.mutate()}
        onToggleActive={(v) => set("is_active", v)}
        onOpenHistory={() => setTab("logs")}
      />

      <KpiStrip agentId={form.id} />

      <StudioTabsNav active={tab} onChange={setTab} />

      <Suspense
        fallback={<div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div>}
      >
        {tab === "geral" && <GeneralTab form={form} set={set} />}
        {tab === "prompt" && (
          <PromptTab
            agentId={form.id}
            agentName={form.name}
            value={form.prompt ?? ""}
            onChange={(v) => set("prompt", v)}
          />
        )}
        {tab === "ferramentas" && (
          <ToolsTab
            enabled={form.enabled_tools ?? []}
            onChange={(v) => set("enabled_tools", v)}
          />
        )}
        {tab === "conhecimento" && (
          <KnowledgeTab agentId={form.id} companyId={form.company_id} />
        )}
        {tab === "memoria" && (
          <PlaceholderTab
            icon={Brain}
            title="Memória do agente"
            description="Configure memória curta, longa, contexto e regras. Em breve com resumo automático por cliente."
          />
        )}
        {tab === "fluxos" && (
          <PlaceholderTab
            icon={Workflow}
            title="Fluxos conectados"
            description="Vincule fluxos de automação, gatilhos e ações. Abra o editor de fluxos para editar."
          />
        )}
        {tab === "integracoes" && (
          <PlaceholderTab
            icon={Plug}
            title="Integrações"
            description="WhatsApp, Email, CRM, Calendário, Drive, API, Webhook — status, latência e sincronização."
          />
        )}
        {tab === "conversas" && (
          <PlaceholderTab
            icon={MessageSquare}
            title="Conversas do agente"
            description="Histórico completo das conversas atendidas por este agente, com filtros e resumo IA."
          />
        )}
        {tab === "logs" && <LogsTab agentId={form.id} />}
        {tab === "testes" && (
          <PlaceholderTab
            icon={Play}
            title="Playground avançado"
            description="Use o botão Testar no topo para abrir o Playground em tempo real com métricas de execução."
          />
        )}
        {tab === "analytics" && (
          <PlaceholderTab
            icon={BarChart3}
            title="Analytics do agente"
            description="Conversões, uso por horário, canais, campanhas, ferramentas mais usadas — em construção."
          />
        )}
      </Suspense>

      {/* Danger zone */}
      <div className="mt-6 flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <div>
          <p className="font-medium">Excluir agente</p>
          <p className="text-xs text-muted-foreground">
            Esta ação é irreversível. Todos os logs e versões serão perdidos.
          </p>
        </div>
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            if (confirm(`Excluir "${form.name}"?`)) deleteMut.mutate();
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Excluir
        </Button>
      </div>

      <Suspense fallback={null}>
        {playgroundOpen && (
          <PlaygroundDrawer
            open={playgroundOpen}
            onOpenChange={setPlaygroundOpen}
            agent={form}
          />
        )}
        <CopilotFab
          agentName={form.name}
          getPrompt={() => form.prompt ?? ""}
          onApply={(result) => {
            set("prompt", result);
            toast.success("Prompt atualizado (não esqueça de salvar)");
          }}
        />
      </Suspense>

      {/* prevent unused-import warnings for icon set */}
      <span className="hidden">
        <Boxes />
        <BookOpen />
        <ListTree />
        <History />
        <Sparkles />
        <Settings2 />
      </span>
    </div>
  );
}
