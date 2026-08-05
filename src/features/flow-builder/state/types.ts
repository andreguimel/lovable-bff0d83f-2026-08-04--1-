/**
 * FB-02 — Modelo de estado interno do Flow Builder V2.
 *
 * Este modelo é *interno* à store. A conversão para/do banco é feita
 * exclusivamente pelo serializer (`../io/serializer.ts`). O restante do
 * builder nunca deve tocar no shape do banco diretamente.
 */
export interface BuilderPosition {
  x: number;
  y: number;
}

export interface BuilderNode<TData = Record<string, unknown>> {
  id: string;
  kind: string;
  position: BuilderPosition;
  data: TData;
}

export interface BuilderEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  label: string | null;
  /**
   * FB-V1.2 · Smart Transition Delay — atraso (em ms) aplicado pelo
   * executor entre o término do bloco de origem e o início do bloco de
   * destino. `0` significa transição imediata. Persistido em
   * `flow_edges.transition_delay_ms`.
   */
  transitionDelayMs?: number;
}

export interface BuilderSelection {
  nodeIds: string[];
  edgeIds: string[];
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface BuilderMeta {
  flowId: string | null;
  loadedAt: number | null;
}

/**
 * Estrutura serializável do grafo — usada pelo serializer e por
 * clipboard/copy-paste futuros.
 */
export interface BuilderGraphSnapshot {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
}
