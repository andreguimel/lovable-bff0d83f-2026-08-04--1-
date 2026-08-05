import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import {
  createFlowVersion,
  getFlowGraph,
  runFlowTest,
  saveFlowGraph,
  setFlowStatus,
  updateFlowMeta,
} from "@/lib/flows.functions";
import { listAgents } from "@/lib/agents.functions";
import { listChannels } from "@/lib/channels.functions";

import { BlockLibrary } from "@/components/flows/studio/block-library";
import { BLOCKS, type NodeKind } from "@/components/flows/studio/blocks";
import { FlowNode, type FlowNodeData } from "@/components/flows/studio/custom-node";
import { PropertiesPanel } from "@/components/flows/studio/properties-panel";
import { StudioTopbar, type TriggerType } from "@/components/flows/studio/studio-topbar";
import { CopilotFab, type AIFlowPatch } from "@/components/flows/studio/copilot-fab";
import { TestResultDrawer, type TestStep } from "@/components/flows/studio/test-drawer";
import { AnalyticsDrawer } from "@/components/flows/studio/analytics-drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileFlowDetail } from "@/components/flows/mobile/mobile-flow-detail";
import { FLOW_BUILDER_V2_ENABLED } from "@/features/flow-builder/flags";
import { FlowStudioV2 } from "@/features/flow-builder/FlowStudioV2";

const NODE_TYPES: NodeTypes = { flow: FlowNode };

export const Route = createFileRoute("/_authenticated/flows/$flowId")({
  head: () => ({ meta: [{ title: "Flow Studio — Zenda" }] }),
  component: FlowRoute,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Fluxo não encontrado.</div>,
});

function FlowRoute() {
  const { flowId } = Route.useParams();
  const isMobile = useIsMobile();
  const [forceDesktop, setForceDesktop] = useState(false);
  if (isMobile && !forceDesktop) {
    return <MobileFlowDetail flowId={flowId} onOpenDesktopEditor={() => setForceDesktop(true)} />;
  }
  if (FLOW_BUILDER_V2_ENABLED) {
    return <FlowStudioV2 flowId={flowId} />;
  }
  return (
    <ReactFlowProvider>
      <FlowStudio />
    </ReactFlowProvider>
  );
}

type HistoryEntry = { nodes: Node<FlowNodeData>[]; edges: Edge[] };

function FlowStudio() {
  const { flowId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const rf = useReactFlow();

  const fetchGraph = useServerFn(getFlowGraph);
  const saveGraphFn = useServerFn(saveFlowGraph);
  const createVersionFn = useServerFn(createFlowVersion);
  const setStatusFn = useServerFn(setFlowStatus);
  const updateMetaFn = useServerFn(updateFlowMeta);
  const runTestFn = useServerFn(runFlowTest);
  const listAgentsFn = useServerFn(listAgents);
  const listChannelsFn = useServerFn(listChannels);

  const { data: agents = [] } = useQuery<Array<{ id: string; name: string; is_active: boolean }>>({
    queryKey: ["agents-min"],
    queryFn: () => listAgentsFn(),
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["channels-min"],
    queryFn: () => listChannelsFn(),
  });
  const { data } = useQuery({
    queryKey: ["flow-graph", flowId],
    queryFn: () => fetchGraph({ data: { flowId } }),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [testSteps, setTestSteps] = useState<TestStep[] | null>(null);
  const [testMeta, setTestMeta] = useState<{ status: string; error: string | null } | null>(
    null,
  );

  const AUTOSAVE_DEBOUNCE_MS = 800;
  const DRAFT_KEY = `flow-draft:${flowId}`;
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo / redo history stacks
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const pushHistory = useCallback(() => {
    undoStack.current.push({ nodes, edges });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setHistoryTick((t) => t + 1);
  }, [nodes, edges]);

  // Load graph from server
  useEffect(() => {
    if (!data) return;
    const loaded: Node<FlowNodeData>[] = data.nodes.map((n) => {
      const kind = (n.node_type as NodeKind) ?? "message";
      const nd = (n.data as Record<string, unknown>) ?? {};
      const pos = (n.position as { x: number; y: number }) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        position: pos,
        type: "flow",
        data: { ...nd, __kind: kind } as FlowNodeData,
      };
    });
    if (!loaded.some((n) => n.data.__kind === "start")) {
      loaded.unshift({
        id: crypto.randomUUID(),
        position: { x: 0, y: 0 },
        type: "flow",
        data: { __kind: "start", label: "Início" },
      });
    }
    setNodes(loaded);
    setEdges(
      data.edges.map((e) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        sourceHandle: e.source_handle ?? undefined,
        label: e.label ?? undefined,
        type: "smoothstep",
        animated: true,
        style: { stroke: "color-mix(in oklab, var(--color-primary) 50%, transparent)", strokeWidth: 1.5 },
      })),
    );
    setDirty(false);
    undoStack.current = [];
    redoStack.current = [];
  }, [data, setNodes, setEdges]);

  // Handle connections
  const onConnect = useCallback(
    (c: Connection) => {
      pushHistory();
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            id: crypto.randomUUID(),
            type: "smoothstep",
            animated: true,
            style: {
              stroke:
                c.sourceHandle === "false"
                  ? "color-mix(in oklab, oklch(0.6 0.2 25) 70%, transparent)"
                  : c.sourceHandle === "true"
                    ? "color-mix(in oklab, oklch(0.65 0.18 145) 70%, transparent)"
                    : "color-mix(in oklab, var(--color-primary) 50%, transparent)",
              strokeWidth: 1.5,
            },
          },
          eds,
        ),
      );
      setDirty(true);
    },
    [pushHistory, setEdges],
  );

  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      pushHistory();
      const id = crypto.randomUUID();
      const meta = BLOCKS[kind];
      const n: Node<FlowNodeData> = {
        id,
        position: position ?? {
          x: 240 + Math.random() * 120,
          y: 100 + Math.random() * 160,
        },
        type: "flow",
        data: { __kind: kind, label: meta.label },
      };
      setNodes((ns) => [...ns, n]);
      setSelectedId(id);
      setDirty(true);
    },
    [pushHistory, setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      if (n.data.__kind === "start") {
        toast.error("Não é possível remover o nó de início.");
        return;
      }
      pushHistory();
      setNodes((ns) => ns.filter((x) => x.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      if (selectedId === id) setSelectedId(null);
      setDirty(true);
    },
    [nodes, selectedId, pushHistory, setNodes, setEdges],
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      pushHistory();
      const copy: Node<FlowNodeData> = {
        ...n,
        id: crypto.randomUUID(),
        position: { x: n.position.x + 60, y: n.position.y + 60 },
        selected: false,
      };
      setNodes((ns) => [...ns, copy]);
      setSelectedId(copy.id);
      setDirty(true);
    },
    [nodes, pushHistory, setNodes],
  );

  const updateSelected = useCallback(
    (patch: Partial<FlowNodeData>) => {
      if (!selectedId) return;
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== selectedId) return n;
          return { ...n, data: { ...n.data, ...patch } };
        }),
      );
      setDirty(true);
    },
    [selectedId, setNodes],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push({ nodes, edges });
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  }, [nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ nodes, edges });
    setNodes(next.nodes);
    setEdges(next.edges);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  }, [nodes, edges, setNodes, setEdges]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          deleteNode(selectedId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, deleteNode]);

  // Drag and drop from library
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/x-flow-block") as NodeKind;
      if (!kind || !BLOCKS[kind]) return;
      const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(kind, position);
    },
    [rf, addNode],
  );

  const trackChanges = useCallback(
    (c: NodeChange<Node<FlowNodeData>>[]) => {
      onNodesChange(c);
      if (c.some((x) => x.type === "position" || x.type === "remove")) setDirty(true);
    },
    [onNodesChange],
  );

  const buildSavePayload = useCallback(() => {
    const nodePayload = nodes.map((n) => {
      const { __kind, label, ...rest } = n.data as FlowNodeData;
      return {
        id: n.id,
        node_type: __kind ?? "message",
        position: { x: n.position.x, y: n.position.y },
        data: { ...(rest as Record<string, unknown>), label: label ?? "" } as Record<
          string,
          unknown
        >,
      };
    });
    const edgePayload = edges.map((e) => ({
      id: e.id,
      source_node_id: e.source,
      target_node_id: e.target,
      source_handle: e.sourceHandle ?? null,
      label: typeof e.label === "string" ? e.label : null,
    }));
    return { nodes: nodePayload, edges: edgePayload };
  }, [nodes, edges]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      setSaveState("saving");
      const payload = buildSavePayload();
      return saveGraphFn({ data: { flowId, ...payload } });
    },
    onSuccess: () => {
      setDirty(false);
      setSaveState("saved");
      setSaveError(null);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["flow-graph", flowId] });
      qc.invalidateQueries({ queryKey: ["flows-list"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      setSaveState("error");
      setSaveError(msg);
      toast.error(msg);
    },
  });

  // Auto-save com debounce
  useEffect(() => {
    if (!dirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (!saveMutation.isPending) saveMutation.mutate();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // saveMutation identity is stable enough; intentional dep list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, nodes, edges]);

  // Rascunho local em sessionStorage (recuperação após fechamento inesperado)
  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ savedAt: Date.now(), payload: buildSavePayload() }),
      );
    } catch {
      /* quota exceeded — silencioso */
    }
  }, [dirty, nodes, edges, DRAFT_KEY, buildSavePayload]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (dirty) await saveMutation.mutateAsync();
      return createVersionFn({
        data: {
          flowId,
          publish: true,
          description: "Publicada pelo editor de fluxos",
        },
      });
    },
    onSuccess: () => {
      toast.success("Fluxo publicado!");
      qc.invalidateQueries({ queryKey: ["flow-graph", flowId] });
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

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const applyAIPatch = useCallback(
    (patch: AIFlowPatch) => {
      pushHistory();
      const loaded: Node<FlowNodeData>[] = patch.nodes.map((n) => ({
        id: n.id,
        position: n.position,
        type: "flow",
        data: { ...(n.data as Record<string, unknown>), __kind: n.node_type as NodeKind } as FlowNodeData,
      }));
      setNodes(loaded);
      setEdges(
        patch.edges.map((e) => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          sourceHandle: e.source_handle ?? undefined,
          label: e.label ?? undefined,
          type: "smoothstep",
          animated: true,
        })),
      );
      setDirty(true);
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 50);
    },
    [pushHistory, setNodes, setEdges, rf],
  );

  const contextSummary = useMemo(() => {
    const parts = nodes.map((n) => {
      const k = n.data.__kind;
      const label = n.data.label ?? "";
      return `- ${k}: ${label}`;
    });
    const eparts = edges.map((e) => `- ${e.source} → ${e.target} ${e.sourceHandle ? `(${e.sourceHandle})` : ""}`);
    return [`Nós:`, ...parts, `Conexões:`, ...eparts].join("\n");
  }, [nodes, edges]);

  return (
    <div className="studio-shell">
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
          (data as { hasUnpublishedChanges?: boolean } | undefined)?.hasUnpublishedChanges ?? false
        }

        canUndo={undoStack.current.length > 0 && historyTick >= 0}
        canRedo={redoStack.current.length > 0}
        triggerType={(data?.flow.trigger_type as TriggerType) ?? "manual"}
        triggerConfig={
          (data?.flow as { trigger_config?: Record<string, unknown> } | undefined)
            ?.trigger_config ?? {}
        }
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        onRename={(name) => metaMutation.mutate({ flowId, name })}
        onDescribe={(description) => metaMutation.mutate({ flowId, description })}
        onSave={() => saveMutation.mutate()}
        onTest={() => testMutation.mutate()}
        onPublish={() => publishMutation.mutate()}
        onArchive={() =>
          setStatusFn({ data: { flowId, status: "archived" } })
            .then(() => {
              toast.success("Fluxo arquivado.");
              qc.invalidateQueries({ queryKey: ["flow-graph", flowId] });
              qc.invalidateQueries({ queryKey: ["flows-list"] });
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : "Erro"))
        }
        onUndo={undo}
        onRedo={redo}
        onOpenAnalytics={() => setShowAnalytics(true)}
        onSaveTrigger={(triggerType, triggerConfig) =>
          metaMutation.mutate({ flowId, triggerType, triggerConfig })
        }
      />

      <div className="studio-body">
        <BlockLibrary onAdd={(k) => addNode(k)} />

        <div className="studio-canvas" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={trackChanges}
            onEdgesChange={(c) => {
              onEdgesChange(c);
              if (c.some((x) => x.type === "remove")) setDirty(true);
            }}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep", animated: true }}
            className="flow-canvas"
            snapToGrid
            snapGrid={[16, 16]}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="color-mix(in oklab, var(--color-border) 60%, transparent)"
            />
            <MiniMap
              pannable
              zoomable
              className="flow-minimap"
              nodeColor={(n) => {
                const k = (n.data as FlowNodeData)?.__kind ?? "message";
                return BLOCKS[k]?.accent ?? "oklch(0.7 0.1 240)";
              }}
              maskColor="color-mix(in oklab, var(--color-background) 80%, transparent)"
            />
            <Controls className="flow-controls" showInteractive={false} />
          </ReactFlow>

          <CopilotFab
            flowId={flowId}
            onApply={applyAIPatch}
            contextSummary={contextSummary}
          />
        </div>

        {selected && (
          <PropertiesPanel
            key={selected.id}
            nodeId={selected.id}
            kind={selected.data.__kind}
            data={selected.data}
            agents={agents}
            flowId={flowId}
            onChange={updateSelected}
            onDelete={() => deleteNode(selected.id)}
            onDuplicate={() => duplicateNode(selected.id)}
          />
        )}
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

      <AnalyticsDrawer
        flowId={flowId}
        open={showAnalytics}
        onClose={() => setShowAnalytics(false)}
      />
    </div>
  );
}
