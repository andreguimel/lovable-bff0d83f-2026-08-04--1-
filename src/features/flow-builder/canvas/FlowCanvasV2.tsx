/**
 * FB-03 · FB-10.3.1 — Canvas V2.
 *
 * O Canvas é o protagonista. Ele:
 *  - lê nodes/edges DIRETO da store Zustand (fonte única de verdade);
 *  - traduz eventos do React Flow em mutações da store;
 *  - aceita drop da BlockLibrary via `application/x-flow-block`;
 *  - registra dois NodeTypes (fbv2 legado / fbv3 atual);
 *  - aplica estilo canônico às arestas em `styleEdge` (contínuas,
 *    espessura 2px, marker sólido — FB-10.3.1);
 *  - expõe o botão flutuante "Organizar fluxo" (auto-layout LTR).
 *
 * Não faz IO — carregamento e persistência ficam no shell.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HelpCircle, Keyboard, LayoutGrid, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { blockRegistry } from "../blocks/registry";
import { useBuilderStore } from "../state/store";
import { useEdgeIds, useNodeIds } from "../state/selectors";
import { BlockNode } from "./BlockNode";
import { styleEdge } from "./edges";
import { BlockNodeV3 } from "./v3/BlockNodeV3";
import { SoftCurvedEdge } from "./v3/SoftCurvedEdge";
import { CanvasEmptyState } from "./v3/CanvasEmptyState";
import { ShortcutsOverlay } from "./v3/ShortcutsOverlay";
import { CommandPalette } from "./v3/CommandPalette";
import { isV3Kind } from "./v3/tokens";
import { computeLayeredLayout } from "./layout";
import "./v3/v3.css";

const NODE_TYPES: NodeTypes = { fbv2: BlockNode, fbv3: BlockNodeV3 };
const EDGE_TYPES: EdgeTypes = { "fbv3-soft": SoftCurvedEdge };

export interface FlowCanvasV2Props {
  className?: string;
}

const DENSITY_STORAGE_KEY = "flow-builder.v3.canvas.density";
type Density = "compact" | "detailed";

function readDensity(): Density {
  if (typeof window === "undefined") return "detailed";
  try {
    const v = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return v === "compact" ? "compact" : "detailed";
  } catch {
    return "detailed";
  }
}

export function FlowCanvasV2({ className }: FlowCanvasV2Props) {
  const rf = useReactFlow();
  const nodeIds = useNodeIds();
  const edgeIds = useEdgeIds();
  // FB-10.3.1 — subscribe direto aos dicionários. Como o store usa Immer,
  // qualquer mutação (posição, data, seleção) produz novas referências e
  // dispara o useMemo abaixo. Sem isso, um `applyLayout` que só mexe em
  // posições não recomputava os `Node[]` do React Flow.
  const nodesById = useBuilderStore((s) => s.nodesById);
  const edgesById = useBuilderStore((s) => s.edgesById);
  const selectedNodeIds = useBuilderStore((s) => s.selection.nodeIds);
  const selectedEdgeIds = useBuilderStore((s) => s.selection.edgeIds);
  const dragCounter = useRef(0);
  const [density, setDensity] = useState<Density>(readDensity);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
    } catch { /* noop */ }
  }, [density]);

  const nodes = useMemo<Node[]>(() => {
    const selected = new Set(selectedNodeIds);
    const incoming = new Set<string>();
    const outgoing = new Set<string>();
    const outgoingHandles = new Map<string, Set<string>>();
    for (const eid of edgeIds) {
      const e = edgesById[eid];
      if (!e) continue;
      incoming.add(e.target);
      outgoing.add(e.source);
      const set = outgoingHandles.get(e.source) ?? new Set<string>();
      set.add(e.sourceHandle ?? "default");
      outgoingHandles.set(e.source, set);
    }
    return nodeIds
      .map((id) => nodesById[id])
      .filter(Boolean)
      .map<Node>((n) => ({
        id: n.id,
        type: isV3Kind(n.kind) ? "fbv3" : "fbv2",
        position: n.position,
        selected: selected.has(n.id),
        data: {
          ...n.data,
          __kind: n.kind,
          __hasIncoming: incoming.has(n.id),
          __hasOutgoing: outgoing.has(n.id),
          __outgoingHandles: Array.from(outgoingHandles.get(n.id) ?? []),
          __density: density,
        } as Record<string, unknown>,
      }));
  }, [nodeIds, edgeIds, nodesById, edgesById, selectedNodeIds, density]);

  const edges = useMemo<Edge[]>(() => {
    const selected = new Set(selectedEdgeIds);
    return edgeIds
      .map((id) => edgesById[id])
      .filter(Boolean)
      .map<Edge>((e) => {
        const base: Edge = {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          label: e.label ?? undefined,
          selected: selected.has(e.id),
          // FB-V1.2 · Smart Transition Delay — expõe o atraso para o edge type.
          data: { transitionDelayMs: e.transitionDelayMs ?? 0 },
        };
        const src = nodesById[e.source];
        const tgt = nodesById[e.target];
        if (src && tgt && isV3Kind(src.kind) && isV3Kind(tgt.kind)) {
          return { ...base, type: "fbv3-soft" };
        }
        return styleEdge(base, { selected: selected.has(e.id) });
      });
  }, [edgeIds, edgesById, nodesById, selectedEdgeIds]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const store = useBuilderStore.getState();
    for (const c of changes) {
      if (c.type === "position" && c.position && !c.dragging) {
        store.moveNode(c.id, { x: c.position.x, y: c.position.y });
      } else if (c.type === "remove") {
        const n = store.nodesById[c.id];
        if (n && n.kind === "start") continue;
        store.removeNode(c.id);
      }
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const store = useBuilderStore.getState();
    for (const c of changes) {
      if (c.type === "remove") store.disconnect(c.id);
    }
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    useBuilderStore.getState().connect({
      source: c.source,
      target: c.target,
      sourceHandle: c.sourceHandle ?? null,
      label: null,
    });
    toast.success("Conectado", { duration: 1200 });
  }, []);

  const onSelectionChange = useCallback((p: OnSelectionChangeParams) => {
    const store = useBuilderStore.getState();
    const ids = p.nodes.map((n) => n.id);
    if (ids.length === 0) {
      if (store.selection.nodeIds.length > 0) store.clearSelection();
      return;
    }
    if (ids.length === 1) store.selectNode(ids[0]);
    else store.selectMany(ids);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-flow-block")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      dragCounter.current++;
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      const kind = e.dataTransfer.getData("application/x-flow-block");
      if (!kind || !blockRegistry.has(kind)) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      useBuilderStore.getState().addNode(kind, pos);
    },
    [rf],
  );

  // FB-10.3.1 — Organizar fluxo (auto-layout LTR).
  const organize = useCallback(() => {
    const s = useBuilderStore.getState();
    const rawNodes = s.nodeOrder.map((id) => s.nodesById[id]).filter(Boolean);
    if (rawNodes.length < 2) {
      toast("Nada para organizar — adicione mais blocos antes.");
      return;
    }
    const rawEdges = s.edgeOrder.map((id) => s.edgesById[id]).filter(Boolean);
    const positions = computeLayeredLayout(
      rawNodes.map((n) => ({ id: n.id, kind: n.kind })),
      rawEdges.map((e) => ({ source: e.source, target: e.target })),
    );
    s.applyLayout(positions);
    // pequeno delay para o React Flow atualizar coords antes do fit.
    requestAnimationFrame(() =>
      // FB-12.3 · Fit-view útil: padding maior + minZoom=0.55 mantém cards legíveis em grafos grandes.
      rf.fitView({ padding: 0.35, duration: 400, minZoom: 0.55, maxZoom: 1 }),
    );
    toast.success(`Fluxo reorganizado (${positions.size} blocos).`);
  }, [rf]);

  // FB-13.3 · Hotkeys do canvas.
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;

      // ⌘/Ctrl + K → command palette
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // ? → toggle shortcuts
      if (!meta && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      // Esc
      if (e.key === "Escape") {
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
        useBuilderStore.getState().clearSelection();
        return;
      }
      // ⌘/Ctrl + D → duplicar
      if (meta && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        const s = useBuilderStore.getState();
        const ids = s.selection.nodeIds;
        if (ids.length === 0) return;
        const created: string[] = [];
        for (const id of ids) {
          const n = s.nodesById[id];
          if (!n || n.kind === "start") continue;
          const newId = s.duplicateNode(id);
          if (newId) created.push(newId);
        }
        if (created.length > 0) {
          useBuilderStore.getState().selectMany(created);
          toast.success(
            created.length === 1 ? "Bloco duplicado" : `${created.length} blocos duplicados`,
            { duration: 1400 },
          );
        }
        return;
      }
      // F → fit view
      if (!meta && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        rf.fitView({ padding: 0.35, duration: 400, minZoom: 0.55, maxZoom: 1 });
        return;
      }
      // O → organize
      if (!meta && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        organize();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rf, organize, shortcutsOpen, paletteOpen]);



  // MiniMap: só quando há grafo suficiente para valer a pena olhar.
  const showMinimap = nodeIds.length > 4;

  // Empty state: só o Start (ou nada) e nenhuma conexão.
  const isEmpty = nodeIds.length <= 1 && edgeIds.length === 0;

  return (
    <div
      className={`fbv2-canvas ${className ?? ""}`.trim()}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div className="fbv2-toolbar">
        <button
          type="button"
          className="fbv2-layout-btn"
          onClick={organize}
          title="Reorganiza o grafo em layout hierárquico (esquerda → direita)."
          disabled={nodeIds.length < 2}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Organizar
        </button>
        <button
          type="button"
          className="fbv2-layout-btn"
          onClick={() => setDensity((d) => (d === "compact" ? "detailed" : "compact"))}
          title={density === "compact" ? "Expandir cards (mostrar preview)" : "Compactar cards (mais blocos na tela)"}
        >
          {density === "compact" ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          {density === "compact" ? "Expandir" : "Compactar"}
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onEdgeClick={(_e, edge) => useBuilderStore.getState().selectEdge(edge.id)}
        onPaneClick={() => useBuilderStore.getState().clearSelection()}
        fitView
        fitViewOptions={{ padding: 0.35, maxZoom: 1, minZoom: 0.55 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep", animated: false }}
        snapToGrid
        snapGrid={[4, 4]}
        panOnDrag={[0, 1, 2]}
        selectionOnDrag
        multiSelectionKeyCode={["Meta", "Control", "Shift"]}
        deleteKeyCode={["Backspace", "Delete"]}
        minZoom={0.15}
        maxZoom={2}
        elevateNodesOnSelect
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.2}
          color="color-mix(in oklab, var(--color-border) 55%, transparent)"
        />
        {showMinimap ? (
          <MiniMap
            pannable
            zoomable
            className="fbv2-minimap"
            nodeColor={(n) => {
              const kind = (n.data as { __kind?: string })?.__kind ?? "message";
              const def = blockRegistry.get(kind);
              return def?.meta.accent ?? "oklch(0.7 0.1 240)";
            }}
            nodeStrokeColor="var(--color-border)"
            nodeStrokeWidth={2}
            maskColor="color-mix(in oklab, var(--color-background) 78%, transparent)"
          />
        ) : null}
        <Controls className="fbv2-controls" showInteractive={false} />
      </ReactFlow>
      <CanvasEmptyState visible={isEmpty} />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="fbv3-help-fab"
              style={{ bottom: "82px", right: "24px" }}
              onClick={() => setShortcutsOpen(true)}
              aria-label="Atalhos do teclado do canvas (?)"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="sr-only">Atalhos (?)</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="flex items-center gap-1.5 text-xs">
            <Keyboard className="h-3.5 w-3.5 text-primary-foreground/80" />
            <span>Atalhos do teclado <kbd className="rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1 py-0.2 text-[10px] font-mono">?</kbd></span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

