/**
 * FB-05 — Inserção inteligente.
 *
 * Único ponto que decide *onde* um novo bloco cai e *se* ele já entra
 * conectado. Consumido pelo sidebar, pelo Command Palette e pela ação
 * "adicionar bloco" do estado vazio.
 *
 * NÃO chama React Flow — só a store. Posições vêm em coordenadas de
 * fluxo (as mesmas que a store guarda).
 */
import { blockRegistry } from "../blocks/registry";
import { useBuilderStore } from "../state/store";
import { markUsed } from "./preferences";

export interface InsertContext {
  /** Se informado, o bloco entra conectado a partir deste nó. */
  sourceNodeId?: string | null;
  /** Handle de origem quando `sourceNodeId` é informado. */
  sourceHandle?: string | null;
  /** Coordenada explícita (ex.: drop no canvas). Sobrepõe heurística. */
  position?: { x: number; y: number };
  /** Split de aresta: bloco entra no meio, herda destino e apaga a aresta original. */
  edgeId?: string | null;
}

// FB-10.3.1 — steps calibrados para as dimensões reais do BlockCardV3
// (largura ~300px, altura ~150px). Antes eram pensados para as cápsulas V2.
const DEFAULT_ORIGIN = { x: 80, y: 120 };
const V_STEP = 200;
const H_STEP = 420;

function fallbackPosition(): { x: number; y: number } {
  const s = useBuilderStore.getState();
  const count = s.nodeOrder.length;
  // grid 3 col × N linhas para não empilhar novos blocos em cima do start.
  const col = count % 3;
  const row = Math.floor(count / 3);
  return {
    x: DEFAULT_ORIGIN.x + col * H_STEP,
    y: DEFAULT_ORIGIN.y + row * V_STEP,
  };
}

/**
 * Posição do próximo bloco quando existe uma origem clara. Considera
 * OUTROS filhos já ligados à origem para empilhar verticalmente
 * (evita sobreposição em ramificações).
 */
function computeConnectedPosition(sourceId: string): { x: number; y: number } {
  const s = useBuilderStore.getState();
  const src = s.nodesById[sourceId];
  if (!src) return fallbackPosition();
  // filhos já existentes ligados a esta origem
  const childY: number[] = [];
  for (const eid of s.edgeOrder) {
    const e = s.edgesById[eid];
    if (!e || e.source !== sourceId) continue;
    const child = s.nodesById[e.target];
    if (child) childY.push(child.position.y);
  }
  const x = src.position.x + H_STEP;
  if (childY.length === 0) return { x, y: src.position.y };
  const maxY = Math.max(...childY);
  return { x, y: maxY + V_STEP };
}

function findExistingEdgeFromSource(sourceId: string, sourceHandle: string | null): string | null {
  const s = useBuilderStore.getState();
  const sourceKey = sourceHandle ?? "default";
  for (const eid of s.edgeOrder) {
    const e = s.edgesById[eid];
    if (!e) continue;
    if (e.source === sourceId && (e.sourceHandle ?? "default") === sourceKey) return eid;
  }
  return null;
}

function computeInsertedBetweenPosition(
  sourceId: string,
  targetId: string,
  fallbackSourceHandle: string | null,
): { x: number; y: number } {
  const s = useBuilderStore.getState();
  const src = s.nodesById[sourceId];
  const tgt = s.nodesById[targetId];
  if (src && tgt) {
    return {
      x: Math.round((src.position.x + tgt.position.x) / 2),
      y: Math.round((src.position.y + tgt.position.y) / 2),
    };
  }
  return src ? computeConnectedPositionForHandle(sourceId, fallbackSourceHandle) : fallbackPosition();
}

function computeConnectedPositionForHandle(sourceId: string, sourceHandle: string | null): { x: number; y: number } {
  const s = useBuilderStore.getState();
  const src = s.nodesById[sourceId];
  if (!src) return fallbackPosition();
  const children = s.edgeOrder
    .map((eid) => s.edgesById[eid])
    .filter((e) => e && e.source === sourceId)
    .map((e) => s.nodesById[e.target])
    .filter(Boolean);
  const base = computeConnectedPosition(sourceId);
  if (!sourceHandle || children.length === 0) return base;
  return {
    x: src.position.x + H_STEP,
    y: src.position.y + children.length * V_STEP,
  };
}

/**
 * Insere um bloco aplicando a inserção inteligente.
 * Retorna o id do novo nó, ou `null` se o kind não existe no Registry.
 */
export function insertBlock(kind: string, ctx: InsertContext = {}): string | null {
  if (!blockRegistry.has(kind)) return null;
  const store = useBuilderStore.getState();

  // split de aresta: origem = source atual, destino = target atual
  if (ctx.edgeId) {
    const edge = store.edgesById[ctx.edgeId];
    if (edge) {
      const src = store.nodesById[edge.source];
      const tgt = store.nodesById[edge.target];
      const position =
        ctx.position ??
        (src && tgt
          ? {
              x: (src.position.x + tgt.position.x) / 2,
              y: (src.position.y + tgt.position.y) / 2,
            }
          : fallbackPosition());
      const newId = store.addNode(kind, position);
      store.disconnect(ctx.edgeId);
      store.connect({
        source: edge.source,
        target: newId,
        sourceHandle: edge.sourceHandle,
        label: null,
      });
      const def = blockRegistry.get(kind);
      const insertedNode = useBuilderStore.getState().nodesById[newId];
      const out = def?.getHandles
        ? def.getHandles(insertedNode?.data ?? {})?.out
        : def?.meta.handles.out;
      if ((out?.length ?? 0) > 0) {
        store.connect({ source: newId, target: edge.target, sourceHandle: null, label: null });
      }
      store.selectNode(newId);
      markUsed(kind);
      return newId;
    }
  }

  // origem definida: conecta imediatamente
  if (ctx.sourceNodeId && store.nodesById[ctx.sourceNodeId]) {
    const sourceHandle = ctx.sourceHandle ?? null;
    const existingEdgeId = findExistingEdgeFromSource(ctx.sourceNodeId, sourceHandle);
    const existingEdge = existingEdgeId ? store.edgesById[existingEdgeId] : null;
    const position =
      ctx.position ??
      (existingEdge
        ? computeInsertedBetweenPosition(ctx.sourceNodeId, existingEdge.target, sourceHandle)
        : computeConnectedPositionForHandle(ctx.sourceNodeId, sourceHandle));
    const newId = store.addNode(kind, position);
    if (existingEdgeId && existingEdge) {
      store.disconnect(existingEdgeId);
    }
    store.connect({
      source: ctx.sourceNodeId,
      target: newId,
      sourceHandle,
      label: null,
    });
    if (existingEdge) {
      const def = blockRegistry.get(kind);
      const insertedNode = useBuilderStore.getState().nodesById[newId];
      const out = def?.getHandles
        ? def.getHandles(insertedNode?.data ?? {})?.out
        : def?.meta.handles.out;
      if ((out?.length ?? 0) > 0) {
        store.connect({ source: newId, target: existingEdge.target, sourceHandle: null, label: null });
      }
    }
    store.selectNode(newId);
    markUsed(kind);
    return newId;
  }

  // fallback: posição explícita > heurística
  const position = ctx.position ?? fallbackPosition();
  const newId = store.addNode(kind, position);
  store.selectNode(newId);
  markUsed(kind);
  return newId;
}
