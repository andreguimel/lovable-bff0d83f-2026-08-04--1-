/**
 * FB-02 — Store central do Flow Builder V2 (Zustand + immer).
 *
 * Fonte única de verdade para nodes/edges/selection/dirty. Toda mutação
 * passa por aqui; nenhum componente mantém estado paralelo do grafo.
 * A store é *headless*: não conhece React Flow, DnD, autosave ou API —
 * apenas o modelo interno. Wiring com UI/servidor virá em FB-03+.
 *
 * Undo/Redo: preparado (via `history/patches`), habilitado só em FB-06.
 */
import { create } from "zustand";
import { produce } from "immer";
import { blockRegistry } from "../blocks/registry";
import { builderBus } from "../events/bus";
import { HistoryStack, withHistory } from "../history/patches";
import type {
  BuilderEdge,
  BuilderGraphSnapshot,
  BuilderMeta,
  BuilderNode,
  BuilderPosition,
  BuilderSelection,
  SaveState,
} from "./types";

interface CoreState {
  meta: BuilderMeta;
  nodesById: Record<string, BuilderNode>;
  edgesById: Record<string, BuilderEdge>;
  nodeOrder: string[];
  edgeOrder: string[];
  selection: BuilderSelection;
  dirty: boolean;
  saveState: SaveState;
  saveError: string | null;
}

export interface BuilderStore extends CoreState {
  // --- carregamento
  loadFromSnapshot: (flowId: string, snapshot: BuilderGraphSnapshot) => void;
  toSnapshot: () => BuilderGraphSnapshot;

  // --- mutações de nó
  addNode: (kind: string, position: BuilderPosition, dataOverride?: Record<string, unknown>) => string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** substitui integralmente `data` (usado por Cancelar do SmartSidebar). */
  replaceNodeData: (id: string, data: Record<string, unknown>) => void;
  moveNode: (id: string, position: BuilderPosition) => void;
  /**
   * FB-10.3.1 — Reposiciona vários nós num único passo atômico.
   * Uma única entrada de histórico (undo restaura todas as posições
   * anteriores). IDs ausentes no mapa são ignorados.
   */
  applyLayout: (positions: Map<string, BuilderPosition>) => void;
  duplicateNode: (id: string) => string | null;
  removeNode: (id: string) => void;
  removeMany: (ids: string[]) => void;


  // --- mutações de aresta
  connect: (edge: Omit<BuilderEdge, "id"> & { id?: string }) => string;
  disconnect: (edgeId: string) => void;
  /** FB-V1.2 · Smart Transition Delay — grava o atraso da aresta em ms. */
  setEdgeTransitionDelay: (edgeId: string, delayMs: number) => void;

  // --- seleção (única ponta de seleção do builder)
  selectNode: (id: string | null) => void;
  toggleSelectNode: (id: string) => void;
  selectMany: (nodeIds: string[]) => void;
  /** FB-V1.2 · Seleciona uma aresta (usada pelo painel de propriedades de edge). */
  selectEdge: (id: string | null) => void;
  clearSelection: () => void;

  // --- persistência (flags — a chamada real vem em FB-03)
  markSaving: () => void;
  markSaved: () => void;
  markSaveError: (msg: string) => void;

  // --- undo/redo (habilitação real em FB-06)
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // teste
  _reset: () => void;
}

const initialState: CoreState = {
  meta: { flowId: null, loadedAt: null },
  nodesById: {},
  edgesById: {},
  nodeOrder: [],
  edgeOrder: [],
  selection: { nodeIds: [], edgeIds: [] },
  dirty: false,
  saveState: "idle",
  saveError: null,
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export const useBuilderStore = create<BuilderStore>((set, get) => {
  const history = new HistoryStack(100);

  /** Aplica um mutator com immer e empilha os patches para undo/redo. */
  const mutate = (mutator: (draft: CoreState) => void, markDirty = true) => {
    const prev = get();
    const { next, pair } = withHistory<CoreState>(
      {
        meta: prev.meta,
        nodesById: prev.nodesById,
        edgesById: prev.edgesById,
        nodeOrder: prev.nodeOrder,
        edgeOrder: prev.edgeOrder,
        selection: prev.selection,
        dirty: prev.dirty,
        saveState: prev.saveState,
        saveError: prev.saveError,
      },
      mutator,
    );
    history.push(pair);
    set({
      ...next,
      dirty: markDirty ? true : next.dirty,
    });
  };

  return {
    ...initialState,

    loadFromSnapshot: (flowId, snapshot) => {
      history.clear();
      const nodesById: Record<string, BuilderNode> = {};
      const nodeOrder: string[] = [];
      for (const n of snapshot.nodes) {
        nodesById[n.id] = n;
        nodeOrder.push(n.id);
      }
      const edgesById: Record<string, BuilderEdge> = {};
      const edgeOrder: string[] = [];
      for (const e of snapshot.edges) {
        edgesById[e.id] = e;
        edgeOrder.push(e.id);
      }
      set({
        meta: { flowId, loadedAt: Date.now() },
        nodesById,
        edgesById,
        nodeOrder,
        edgeOrder,
        selection: { nodeIds: [], edgeIds: [] },
        dirty: false,
        saveState: "idle",
        saveError: null,
      });
      builderBus.emit({ type: "flow:loaded", flowId });
    },

    toSnapshot: () => {
      const s = get();
      return {
        nodes: s.nodeOrder.map((id) => s.nodesById[id]).filter(Boolean),
        edges: s.edgeOrder.map((id) => s.edgesById[id]).filter(Boolean),
      };
    },

    addNode: (kind, position, dataOverride) => {
      const id = newId();
      const def = blockRegistry.get(kind);
      const defaults = (def?.meta.defaults ?? {}) as Record<string, unknown>;
      const data = { ...defaults, ...(dataOverride ?? {}) };
      mutate((draft) => {
        draft.nodesById[id] = { id, kind, position, data };
        draft.nodeOrder.push(id);
      });
      builderBus.emit({ type: "node:added", nodeId: id, kind });
      return id;
    },

    updateNodeData: (id, patch) => {
      if (!get().nodesById[id]) return;
      mutate((draft) => {
        const n = draft.nodesById[id];
        n.data = { ...n.data, ...patch };
      });
      builderBus.emit({ type: "node:updated", nodeId: id });
    },

    replaceNodeData: (id, data) => {
      if (!get().nodesById[id]) return;
      mutate((draft) => {
        draft.nodesById[id].data = { ...data };
      });
      builderBus.emit({ type: "node:updated", nodeId: id });
    },



    moveNode: (id, position) => {
      if (!get().nodesById[id]) return;
      mutate((draft) => {
        draft.nodesById[id].position = position;
      });
      builderBus.emit({ type: "node:moved", nodeId: id });
    },

    applyLayout: (positions) => {
      if (positions.size === 0) return;
      const state = get();
      // filtra ids inexistentes e ignora se nada mudou
      let dirty = false;
      for (const [id, p] of positions) {
        const cur = state.nodesById[id];
        if (!cur) continue;
        if (cur.position.x !== p.x || cur.position.y !== p.y) {
          dirty = true;
          break;
        }
      }
      if (!dirty) return;
      mutate((draft) => {
        for (const [id, p] of positions) {
          const n = draft.nodesById[id];
          if (!n) continue;
          n.position = { x: p.x, y: p.y };
        }
      });
      builderBus.emit({ type: "flow:layout-applied" as never });
    },

    duplicateNode: (id) => {
      const original = get().nodesById[id];
      if (!original) return null;
      const newNodeId = newId();
      mutate((draft) => {
        draft.nodesById[newNodeId] = {
          id: newNodeId,
          kind: original.kind,
          position: { x: original.position.x + 40, y: original.position.y + 40 },
          data: JSON.parse(JSON.stringify(original.data)),
        };
        draft.nodeOrder.push(newNodeId);
      });
      builderBus.emit({ type: "node:duplicated", sourceId: id, newId: newNodeId });
      return newNodeId;
    },

    removeNode: (id) => {
      if (!get().nodesById[id]) return;
      mutate((draft) => {
        delete draft.nodesById[id];
        draft.nodeOrder = draft.nodeOrder.filter((x) => x !== id);
        const affectedEdges = draft.edgeOrder.filter((eid) => {
          const e = draft.edgesById[eid];
          return e && (e.source === id || e.target === id);
        });
        for (const eid of affectedEdges) delete draft.edgesById[eid];
        draft.edgeOrder = draft.edgeOrder.filter((eid) => draft.edgesById[eid]);
        draft.selection.nodeIds = draft.selection.nodeIds.filter((x) => x !== id);
      });
      builderBus.emit({ type: "node:removed", nodeId: id });
    },

    removeMany: (ids) => {
      const set0 = new Set(ids);
      mutate((draft) => {
        for (const id of ids) {
          if (draft.nodesById[id]) delete draft.nodesById[id];
        }
        draft.nodeOrder = draft.nodeOrder.filter((x) => !set0.has(x));
        const keepEdges = draft.edgeOrder.filter((eid) => {
          const e = draft.edgesById[eid];
          if (!e) return false;
          if (set0.has(e.source) || set0.has(e.target)) {
            delete draft.edgesById[eid];
            return false;
          }
          return true;
        });
        draft.edgeOrder = keepEdges;
        draft.selection.nodeIds = draft.selection.nodeIds.filter((x) => !set0.has(x));
      });
      for (const id of ids) builderBus.emit({ type: "node:removed", nodeId: id });
    },

    connect: (edge) => {
      const sourceHandle = edge.sourceHandle ?? null;
      const sourceKey = sourceHandle ?? "default";
      const id = edge.id ?? newId();
      mutate((draft) => {
        const conflicting = draft.edgeOrder.filter((eid) => {
          const existing = draft.edgesById[eid];
          if (!existing) return false;
          return existing.source === edge.source && (existing.sourceHandle ?? "default") === sourceKey;
        });
        for (const eid of conflicting) delete draft.edgesById[eid];
        draft.edgeOrder = draft.edgeOrder.filter((eid) => draft.edgesById[eid]);
        draft.edgesById[id] = {
          id,
          source: edge.source,
          target: edge.target,
          sourceHandle,
          label: edge.label ?? null,
          transitionDelayMs: Math.max(0, Math.floor(edge.transitionDelayMs ?? 0)),
        };
        draft.edgeOrder.push(id);
      });
      builderBus.emit({ type: "edge:connected", edgeId: id });
      return id;
    },

    disconnect: (edgeId) => {
      if (!get().edgesById[edgeId]) return;
      mutate((draft) => {
        delete draft.edgesById[edgeId];
        draft.edgeOrder = draft.edgeOrder.filter((x) => x !== edgeId);
        draft.selection.edgeIds = draft.selection.edgeIds.filter((x) => x !== edgeId);
      });
      builderBus.emit({ type: "edge:disconnected", edgeId });
    },

    setEdgeTransitionDelay: (edgeId, delayMs) => {
      if (!get().edgesById[edgeId]) return;
      const ms = Math.max(0, Math.floor(delayMs));
      mutate((draft) => {
        const e = draft.edgesById[edgeId];
        if (!e) return;
        e.transitionDelayMs = ms;
      });
      builderBus.emit({ type: "edge:updated" as never, edgeId } as never);
    },

    selectEdge: (id) => {
      set(
        produce((draft: CoreState) => {
          draft.selection.nodeIds = [];
          draft.selection.edgeIds = id ? [id] : [];
        })(get()),
      );
      builderBus.emit({ type: "edge:selected" as never, edgeId: id } as never);
    },

    selectNode: (id) => {
      const prev = get().selection.nodeIds;
      if ((prev[0] ?? null) === id && prev.length <= 1) return;
      set(
        produce((draft: CoreState) => {
          draft.selection.nodeIds = id ? [id] : [];
          draft.selection.edgeIds = [];
        })(get()),
      );
      builderBus.emit({ type: "node:selected", nodeId: id });
      if (id) builderBus.emit({ type: "inspector:opened", nodeId: id });
      else builderBus.emit({ type: "inspector:closed" });
    },

    toggleSelectNode: (id) => {
      set(
        produce((draft: CoreState) => {
          const idx = draft.selection.nodeIds.indexOf(id);
          if (idx >= 0) draft.selection.nodeIds.splice(idx, 1);
          else draft.selection.nodeIds.push(id);
          draft.selection.edgeIds = [];
        })(get()),
      );
      const last = get().selection.nodeIds.slice(-1)[0] ?? null;
      builderBus.emit({ type: "node:selected", nodeId: last });
    },

    selectMany: (nodeIds) => {
      set(
        produce((draft: CoreState) => {
          draft.selection.nodeIds = [...nodeIds];
          draft.selection.edgeIds = [];
        })(get()),
      );
      builderBus.emit({ type: "node:selected", nodeId: nodeIds.slice(-1)[0] ?? null });
    },

    clearSelection: () => {
      if (get().selection.nodeIds.length === 0 && get().selection.edgeIds.length === 0) return;
      set(
        produce((draft: CoreState) => {
          draft.selection.nodeIds = [];
          draft.selection.edgeIds = [];
        })(get()),
      );
      builderBus.emit({ type: "node:selected", nodeId: null });
      builderBus.emit({ type: "inspector:closed" });
    },

    markSaving: () => set({ saveState: "saving", saveError: null }),
    markSaved: () => set({ saveState: "saved", saveError: null, dirty: false }),
    markSaveError: (msg) => set({ saveState: "error", saveError: msg }),

    undo: () => {
      const pair = history.undo();
      if (!pair) return;
      set((s) => {
        const nextCore: CoreState = {
          meta: s.meta,
          nodesById: s.nodesById,
          edgesById: s.edgesById,
          nodeOrder: s.nodeOrder,
          edgeOrder: s.edgeOrder,
          selection: s.selection,
          dirty: s.dirty,
          saveState: s.saveState,
          saveError: s.saveError,
        };
        const applied = produce(nextCore, (draft) => {
          for (const p of pair.inverse) {
            // aplica patches inversos
            (draft as unknown as Record<string, unknown>);
          }
        });
        // Uso direto de applyPatches evita retype
        return applied;
      });
      // Aplicação real dos patches:
      set((s) => applyInversePatches(s, pair.inverse));
    },

    redo: () => {
      const pair = history.redo();
      if (!pair) return;
      set((s) => applyInversePatches(s, pair.forward));
    },

    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),

    _reset: () => {
      history.clear();
      set({ ...initialState });
    },
  };
});

// Aplicação isolada de patches immer sobre o slice de estado — mantém a
// função `undo/redo` acima curta e evita `produce` aninhado.
import { applyPatches } from "immer";
import type { Patch } from "immer";
function applyInversePatches(state: BuilderStore, patches: Patch[]): Partial<BuilderStore> {
  const slice: CoreState = {
    meta: state.meta,
    nodesById: state.nodesById,
    edgesById: state.edgesById,
    nodeOrder: state.nodeOrder,
    edgeOrder: state.edgeOrder,
    selection: state.selection,
    dirty: state.dirty,
    saveState: state.saveState,
    saveError: state.saveError,
  };
  const next = applyPatches(slice, patches);
  return { ...next, dirty: true };
}
