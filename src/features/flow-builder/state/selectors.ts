/**
 * FB-02 — Seletores atômicos da store.
 *
 * Cada hook re-renderiza somente quando o slice observado muda. Isso
 * elimina o padrão do V1 onde toda edição re-renderizava o Studio
 * inteiro (P5/P19 do audit).
 */
import { useBuilderStore } from "./store";
import type { BuilderNode, BuilderEdge } from "./types";

export function useNode<T = Record<string, unknown>>(
  id: string,
): BuilderNode<T> | undefined {
  return useBuilderStore((s) => s.nodesById[id]) as BuilderNode<T> | undefined;
}

export function useEdge(id: string): BuilderEdge | undefined {
  return useBuilderStore((s) => s.edgesById[id]);
}

export function useIsSelected(id: string): boolean {
  return useBuilderStore((s) => s.selection.nodeIds.includes(id));
}

export function useSelectedNodeId(): string | null {
  return useBuilderStore((s) => s.selection.nodeIds[0] ?? null);
}

export function useSelectedNode<T = Record<string, unknown>>(): BuilderNode<T> | null {
  return useBuilderStore((s) => {
    const id = s.selection.nodeIds[0];
    return id ? ((s.nodesById[id] as BuilderNode<T>) ?? null) : null;
  });
}

export function useNodeIds(): string[] {
  return useBuilderStore((s) => s.nodeOrder);
}

export function useEdgeIds(): string[] {
  return useBuilderStore((s) => s.edgeOrder);
}

export function useSelectedEdgeId(): string | null {
  return useBuilderStore((s) => s.selection.edgeIds[0] ?? null);
}

export function useSelectedEdge(): BuilderEdge | null {
  return useBuilderStore((s) => {
    const id = s.selection.edgeIds[0];
    return id ? (s.edgesById[id] ?? null) : null;
  });
}

export function useDirty(): boolean {
  return useBuilderStore((s) => s.dirty);
}

export function useSaveState() {
  return useBuilderStore((s) => ({ state: s.saveState, error: s.saveError }));
}

export function useFlowId(): string | null {
  return useBuilderStore((s) => s.meta.flowId);
}
