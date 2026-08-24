/**
 * FB-03 — Shell V2.
 *
 * Costura: Topbar + Library + Canvas V2 + Panel (Properties V1 reutilizado)
 *          + Drawers (Test/Analytics) + CopilotFab.
 *
 * IO:
 *  - carrega o grafo via `getFlowGraph` e alimenta a store via
 *    `fromServer` + `loadFromSnapshot`;
 *  - injeta um nó `start` se o backend não devolveu nenhum (paridade V1);
 *  - autosave (debounce 800ms) usa `toServer` + `saveFlowGraph`;
 *  - publish/test/meta idênticos ao V1.
 *
 * Regras:
 *  - React Flow SÓ existe dentro do Canvas V2. Nada de estado paralelo.
 *  - toda edição passa pela store (fonte única).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "sonner";

import "./canvas/canvas.css";

// Garante registro dos blocos no Registry V2.
// IMPORTANTE: package.json declara `"sideEffects": false`, o que faria o Vite
// descartar `import "./blocks/definitions"` no build de produção. Usar um
// import NOMEADO + chamada explícita garante que o módulo seja incluído no
// bundle e que o Registry esteja populado antes do primeiro render — sem
// isso, todos os cards renderizam como "Bloco não reconhecido".
import { ensureLegacyBlocksRegistered } from "./blocks/definitions";
ensureLegacyBlocksRegistered();

import {
  createFlowVersion,
  getFlowGraph,
  listFlows,
  runFlowTest,
  saveFlowGraph,
  setFlowStatus,
  updateFlowMeta,
} from "@/lib/flows.functions";
import { listAgents } from "@/lib/agents.functions";
import { listChannels } from "@/lib/channels.functions";
import { listTags } from "@/lib/inbox.functions";
import { listTeamMembers } from "@/lib/team.functions";


import { StudioTopbar, type TriggerType } from "@/components/flows/studio/studio-topbar";
import { CopilotFab, type AIFlowPatch } from "@/components/flows/studio/copilot-fab";
import { TestResultDrawer, type TestStep } from "@/components/flows/studio/test-drawer";
import { TestChatDrawer } from "@/components/flows/studio/test-chat-drawer";
import { AnalyticsDrawer } from "@/components/flows/studio/analytics-drawer";

import { FlowCanvasV2 } from "./canvas/FlowCanvasV2";
import { computeLayeredLayout, needsAutoLayout } from "./canvas/layout";
import { fromServer, toServer } from "./io/serializer";
import { useBuilderStore } from "./state/store";
import { useNodeIds, useSelectedNode } from "./state/selectors";
import { SmartSidebar } from "./sidebar/SmartSidebar";
import { EdgePropertiesPanel } from "./sidebar/EdgePropertiesPanel";
import { useSelectedEdge } from "./state/selectors";
import { NodeLibraryPanelV3 } from "./library/v3/NodeLibraryPanelV3";
import { LibraryProvider } from "./library/context";
import { EmptyState } from "./library/EmptyState";
import { HealthFab, HealthPanel } from "./panel/HealthPanel";
import { PublishGate } from "./panel/PublishGate";
import { ContainerInspectorDrawer } from "./panel/ContainerInspectorDrawer";
import { analyzeFlow } from "./validation";


interface Props {
  flowId: string;
}

export function FlowStudioV2({ flowId }: Props) {
  return (
    <ReactFlowProvider>
      <FlowStudioV2Inner flowId={flowId} />
    </ReactFlowProvider>
  );
}

function FlowStudioV2Inner({ flowId }: Props) {
  const router = useRouter();
  const qc = useQueryClient();

  const fetchGraph = useServerFn(getFlowGraph);
  const saveGraphFn = useServerFn(saveFlowGraph);
  const createVersionFn = useServerFn(createFlowVersion);
  const setStatusFn = useServerFn(setFlowStatus);
  const updateMetaFn = useServerFn(updateFlowMeta);
  const runTestFn = useServerFn(runFlowTest);
  const listAgentsFn = useServerFn(listAgents);
  const listChannelsFn = useServerFn(listChannels);
  const listTagsFn = useServerFn(listTags);
  const listTeamMembersFn = useServerFn(listTeamMembers);
  const listFlowsFn = useServerFn(listFlows);

  const { data: agents = [] } = useQuery<Array<{ id: string; name: string; is_active: boolean }>>({
    queryKey: ["agents-min"],
    queryFn: () => listAgentsFn(),
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["channels-min"],
    queryFn: () => listChannelsFn(),
  });
  const { data: tags = [] } = useQuery({
    queryKey: ["flow-builder-tags"],
    queryFn: () => listTagsFn(),
  });
  const { data: team } = useQuery({
    queryKey: ["flow-builder-team"],
    queryFn: () => listTeamMembersFn(),
  });
  const { data: flowsAll = [] } = useQuery({
    queryKey: ["flow-builder-flows"],
    queryFn: () => listFlowsFn(),
  });
  const { data } = useQuery({
    queryKey: ["flow-graph", flowId],
    queryFn: () => fetchGraph({ data: { flowId } }),
  });


  const dirty = useBuilderStore((s) => s.dirty);
  const saveState = useBuilderStore((s) => s.saveState);
  const saveError = useBuilderStore((s) => s.saveError);
  const selectedNode = useSelectedNode();
  const selectedEdge = useSelectedEdge();

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [testSteps, setTestSteps] = useState<TestStep[] | null>(null);
  const [testMeta, setTestMeta] = useState<{ status: string; error: string | null } | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [publishGateOpen, setPublishGateOpen] = useState(false);
  const [chatSimOpen, setChatSimOpen] = useState(false);

  // -------- carga inicial (server → store)
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (loadedFor.current === flowId) return;
    const snapshot = fromServer({
      nodes: data.nodes.map((n) => ({
        id: n.id,
        node_type: n.node_type,
        position: n.position as { x: number; y: number } | null,
        data: (n.data as Record<string, unknown> | null) ?? {},
      })),
      edges: data.edges.map((e) => ({
        id: e.id,
        source_node_id: e.source_node_id,
        target_node_id: e.target_node_id,
        source_handle: e.source_handle ?? null,
        label: e.label ?? null,
        transition_delay_ms:
          (e as { transition_delay_ms?: number | null }).transition_delay_ms ?? 0,
      })),
    });
    // Paridade V1: injeta nó `start` se ausente.
    if (!snapshot.nodes.some((n) => n.kind === "start")) {
      snapshot.nodes.unshift({
        id: crypto.randomUUID(),
        kind: "start",
        position: { x: 0, y: 0 },
        data: { label: "Início" },
      });
    }
    useBuilderStore.getState().loadFromSnapshot(flowId, snapshot);
    // FB-12.2 — Auto-layout ao abrir se o grafo veio sem coordenadas humanas.
    // Determinístico: mesmo grafo → mesma disposição. Autosave persiste depois.
    if (needsAutoLayout(snapshot.nodes)) {
      const positions = computeLayeredLayout(
        snapshot.nodes.map((n) => ({ id: n.id, kind: n.kind })),
        snapshot.edges.map((e) => ({ source: e.source, target: e.target })),
      );
      if (positions.size > 0) {
        useBuilderStore.getState().applyLayout(positions);
      }
    }
    loadedFor.current = flowId;
  }, [data, flowId]);

  // reset quando trocar de fluxo
  useEffect(() => {
    return () => {
      if (loadedFor.current !== flowId) return;
      useBuilderStore.getState()._reset();
      loadedFor.current = null;
    };
  }, [flowId]);

  // -------- persistência
  const saveMutation = useMutation({
    mutationFn: async () => {
      useBuilderStore.getState().markSaving();
      const snapshot = useBuilderStore.getState().toSnapshot();
      const payload = toServer(snapshot);
      // O schema do server usa um enum estrito de `node_type`; o Registry
      // V2 conhece exatamente os mesmos kinds (definitions.ts), então o
      // cast é seguro.
      const res = await saveGraphFn({ data: { flowId, ...payload } as never });
      const status = data?.flow?.status;
      if (!status || status === "active" || (status as string) === "published") {
        await createVersionFn({
          data: { flowId, publish: true, description: "Auto-publicado ao salvar" },
        });
      }
      return res;
    },
    onSuccess: () => {
      useBuilderStore.getState().markSaved();
      qc.invalidateQueries({ queryKey: ["flow-graph", flowId] });
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      useBuilderStore.getState().markSaveError(msg);
      toast.error(msg);
    },
  });

  // autosave debounce
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (!saveMutation.isPending) saveMutation.mutate();
    }, 800);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  // -------- publicar / testar / meta
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (dirty) await saveMutation.mutateAsync();
      return createVersionFn({
        data: { flowId, publish: true, description: "Publicada pelo editor de fluxos" },
      });
    },
    onSuccess: async () => {
      toast.success("Fluxo publicado!");
      await qc.refetchQueries({ queryKey: ["flow-graph", flowId] });
      qc.invalidateQueries({ queryKey: ["flows-list"] });
      router.invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao publicar"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (dirty) await saveMutation.mutateAsync();
      return runTestFn({ data: { flowId } });
    },
    onSuccess: (r) => {
      const parsed = JSON.parse(r.stepsJson) as TestStep[];
      setTestSteps(parsed);
      setTestMeta({ status: r.status, error: r.error });
      toast.success(`Teste executado — ${parsed.length} passo(s).`);
      qc.invalidateQueries({ queryKey: ["flow-analytics", flowId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no teste"),
  });

  const metaMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateMetaFn>[0]["data"]) => updateMetaFn({ data: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow-graph", flowId] });
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar meta"),
  });

  // Library V2 e EmptyState são autosuficientes (usam a store diretamente).
  const nodeIds = useNodeIds();
  const startNodeId = useMemo(() => {
    const s = useBuilderStore.getState();
    return nodeIds.find((id) => s.nodesById[id]?.kind === "start") ?? null;
  }, [nodeIds]);
  const isEmpty = nodeIds.length <= 1;

  // -------- Painel de propriedades (FB-04 · SmartSidebar substitui PropertiesPanel)
  const sidebarCtx = useMemo(
    () => ({
      flowId,
      agents,
      channels: channels.map((c) => ({ id: c.id, name: c.name })),
      tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      members: (team?.members ?? []).map((m) => ({
        id: m.id,
        name: m.full_name ?? m.email ?? "Sem nome",
        email: m.email,
      })),
      flows: flowsAll.map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status ?? "draft",
      })),
    }),
    [flowId, agents, channels, tags, team, flowsAll],
  );


  // -------- FB-07 · Publicação segura (pré-voo)
  const handlePublishClick = useCallback(() => {
    // Sempre passa pela gate para gerar relatório + confirmar bloqueios.
    setPublishGateOpen(true);
  }, []);

  const handleConfirmPublish = useCallback(async () => {
    // Última barreira: valida agora com o snapshot atual antes de disparar.
    const s = useBuilderStore.getState();
    const nodes = s.nodeOrder.map((id) => s.nodesById[id]).filter(Boolean);
    const edges = s.edgeOrder.map((id) => s.edgesById[id]).filter(Boolean);
    const report = analyzeFlow(nodes, edges, sidebarCtx, { force: true });
    if (!report.canPublish) {
      toast.error("Existem erros que impedem a publicação.");
      return;
    }
    await publishMutation.mutateAsync();
  }, [publishMutation, sidebarCtx]);





  // -------- Copilot (substitui todo o grafo)
  const applyAIPatch = useCallback((patch: AIFlowPatch) => {
    const store = useBuilderStore.getState();
    const snapshot = fromServer({
      nodes: patch.nodes.map((n) => ({
        id: n.id,
        node_type: n.node_type,
        position: n.position,
        data: n.data as Record<string, unknown>,
      })),
      edges: patch.edges.map((e) => ({
        id: e.id,
        source_node_id: e.source_node_id,
        target_node_id: e.target_node_id,
        source_handle: e.source_handle ?? null,
        label: e.label ?? null,
        transition_delay_ms:
          (e as { transition_delay_ms?: number | null }).transition_delay_ms ?? 0,
      })),
    });
    if (!snapshot.nodes.some((n) => n.kind === "start")) {
      snapshot.nodes.unshift({
        id: crypto.randomUUID(),
        kind: "start",
        position: { x: 0, y: 0 },
        data: { label: "Início" },
      });
    }
    store.loadFromSnapshot(flowId, snapshot);
    // marca dirty para autosave persistir
    store.updateNodeData(snapshot.nodes[0].id, {});
  }, [flowId]);

  const contextSummary = useMemo(() => {
    const s = useBuilderStore.getState();
    const parts = s.nodeOrder.map((id) => {
      const n = s.nodesById[id];
      return `- ${n.kind}: ${(n.data as { label?: string }).label ?? ""}`;
    });
    const eparts = s.edgeOrder.map((id) => {
      const e = s.edgesById[id];
      return `- ${e.source} → ${e.target}${e.sourceHandle ? ` (${e.sourceHandle})` : ""}`;
    });
    return [`Nós:`, ...parts, `Conexões:`, ...eparts].join("\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, selectedNode?.id]);

  return (
    <LibraryProvider>
    <div className="fbv2-shell">
      <StudioTopbar
        name={data?.flow.name ?? ""}
        description={data?.flow.description ?? null}
        status={data?.flow.status ?? "draft"}
        dirty={dirty}
        saving={saveMutation.isPending}
        testing={testMutation.isPending}
        publishing={publishMutation.isPending}
        saveState={saveState}
        saveError={saveError}
        hasUnpublishedChanges={
          (data as { hasUnpublishedChanges?: boolean } | undefined)?.hasUnpublishedChanges ??
          false
        }

        canUndo={useBuilderStore.getState().canUndo()}
        canRedo={useBuilderStore.getState().canRedo()}
        triggerType={(data?.flow.trigger_type as TriggerType) ?? "manual"}
        triggerConfig={
          (data?.flow as { trigger_config?: Record<string, unknown> } | undefined)
            ?.trigger_config ?? {}
        }
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        onRename={(name) => metaMutation.mutate({ flowId, name })}
        onDescribe={(description) => metaMutation.mutate({ flowId, description })}
        onSave={() => {
          if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
          if (!saveMutation.isPending) saveMutation.mutate();
        }}

        onTest={() => {
          if (dirty) saveMutation.mutate();
          setChatSimOpen(true);
        }}
        onPublish={handlePublishClick}
        onArchive={() =>
          setStatusFn({ data: { flowId, status: "archived" } })
            .then(() => {
              toast.success("Fluxo arquivado.");
              qc.invalidateQueries({ queryKey: ["flow-graph", flowId] });
              qc.invalidateQueries({ queryKey: ["flows-list"] });
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : "Erro"))
        }
        onUndo={() => useBuilderStore.getState().undo()}
        onRedo={() => useBuilderStore.getState().redo()}
        onOpenAnalytics={() => setShowAnalytics(true)}
        onSaveTrigger={(triggerType, triggerConfig) =>
          metaMutation.mutate({ flowId, triggerType, triggerConfig })
        }
      />

      <div className="fbv2-body" style={{ display: "flex", flex: 1, width: "100%", height: "100%", minHeight: 0, position: "relative" }}>
        <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, flex: 1 }}>
          <FlowCanvasV2 />
          <ContainerInspectorDrawer />
          <CopilotFab flowId={flowId} onApply={applyAIPatch} contextSummary={contextSummary} />
          {!healthOpen && <HealthFab ctx={sidebarCtx} onOpen={() => setHealthOpen(true)} />}
          <HealthPanel ctx={sidebarCtx} open={healthOpen} onClose={() => setHealthOpen(false)} />
          <PublishGate
            ctx={sidebarCtx}
            open={publishGateOpen}
            onClose={() => setPublishGateOpen(false)}
            onConfirm={handleConfirmPublish}
            publishing={publishMutation.isPending}
          />
        </div>
      </div>


      <TestResultDrawer
        open={testSteps !== null}
        onClose={() => {
          setTestSteps(null);
          setTestMeta(null);
        }}
        steps={testSteps ?? []}
        meta={testMeta}
      />

      <TestChatDrawer open={chatSimOpen} onClose={() => setChatSimOpen(false)} />

      <AnalyticsDrawer
        flowId={flowId}
        open={showAnalytics}
        onClose={() => setShowAnalytics(false)}
      />
    </div>
    </LibraryProvider>
  );
}
