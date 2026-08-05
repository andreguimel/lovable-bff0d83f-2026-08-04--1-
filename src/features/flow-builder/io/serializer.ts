/**
 * FB-02 — Serializer universal do Flow Builder V2.
 *
 * Único ponto que conhece o shape de banco/Runtime. Nenhum outro código
 * do builder deve tocar em `node_type`, `source_node_id` etc.
 *
 * Contrato preservado: o payload aceito por `saveFlowGraph` e devolvido
 * por `getFlowGraph` continua idêntico ao usado pelo V1.
 *
 * Compatibilidade: kinds ainda não migrados para o Registry passam pelo
 * serializer sem perda — o campo `data` viaja como `Record<string, unknown>`
 * intacto, e `label` é extraído/reinjetado quando presente para manter
 * a mesma forma que o V1 salva hoje.
 */
import { blockRegistry } from "../blocks/registry";
import type { BuilderEdge, BuilderGraphSnapshot, BuilderNode } from "../state/types";

/** DTO enviado ao servidor via `saveFlowGraph`. */
export interface ServerNodeDTO {
  id: string;
  node_type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}
export interface ServerEdgeDTO {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  label: string | null;
  /** FB-V1.2 · Smart Transition Delay — atraso em ms aplicado entre blocos. */
  transition_delay_ms?: number;
}
export interface ServerGraphDTO {
  nodes: ServerNodeDTO[];
  edges: ServerEdgeDTO[];
}

/**
 * DTO devolvido por `getFlowGraph` — compatível com o que o V1 recebe.
 * Aceita ambos os shapes: novo (position/node_type) e legado (posição
 * embutida em data). Nesta missão só o novo shape é gerado; o legado é
 * aceito na leitura para tolerância.
 */
export interface LoadedNodeDTO {
  id: string;
  node_type?: string | null;
  position?: { x: number; y: number } | null;
  data?: Record<string, unknown> | null;
}
export interface LoadedEdgeDTO {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string | null;
  label?: string | null;
  transition_delay_ms?: number | null;
}
export interface LoadedGraphDTO {
  nodes: LoadedNodeDTO[];
  edges: LoadedEdgeDTO[];
}

function safePos(p: unknown): { x: number; y: number } {
  if (
    p &&
    typeof p === "object" &&
    typeof (p as { x?: unknown }).x === "number" &&
    typeof (p as { y?: unknown }).y === "number"
  ) {
    return { x: (p as { x: number }).x, y: (p as { y: number }).y };
  }
  return { x: 0, y: 0 };
}

export function fromServer(dto: LoadedGraphDTO): BuilderGraphSnapshot {
  const nodes: BuilderNode[] = dto.nodes.map((n) => {
    const kind = (n.node_type ?? "message") as string;
    const raw: Record<string, unknown> = { ...(n.data ?? {}) };

    const def = blockRegistry.get(kind);
    const data = def?.fromServer ? def.fromServer(raw) : raw;

    return {
      id: n.id,
      kind,
      position: safePos(n.position),
      data,
    };
  });

  const edges: BuilderEdge[] = dto.edges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_handle ?? null,
    label: e.label ?? null,
    transitionDelayMs: Math.max(0, Number(e.transition_delay_ms ?? 0) || 0),
  }));

  return { nodes, edges };
}

export function toServer(snapshot: BuilderGraphSnapshot): ServerGraphDTO {
  const nodes: ServerNodeDTO[] = snapshot.nodes.map((n) => {
    const def = blockRegistry.get(n.kind);
    const data = def?.toServer ? def.toServer(n.data) : (n.data as Record<string, unknown>);
    return {
      id: n.id,
      node_type: n.kind,
      position: { x: n.position.x, y: n.position.y },
      data: { ...data },
    };
  });

  const edges: ServerEdgeDTO[] = snapshot.edges.map((e) => ({
    id: e.id,
    source_node_id: e.source,
    target_node_id: e.target,
    source_handle: e.sourceHandle,
    label: e.label,
    transition_delay_ms: Math.max(0, Math.floor(e.transitionDelayMs ?? 0)),
  }));

  return { nodes, edges };
}

/**
 * Round-trip de referência para testes: `toServer(fromServer(x))` deve
 * ser estruturalmente equivalente ao input para qualquer fluxo válido.
 */
export function roundTrip(dto: LoadedGraphDTO): ServerGraphDTO {
  return toServer(fromServer(dto));
}
