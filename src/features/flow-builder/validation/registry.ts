/**
 * FB-07 — Registry extensível de validadores.
 *
 * Duas categorias:
 *  - graphRule: percorre o grafo inteiro (start ausente, ciclos, órfãos…).
 *  - blockRule: valida um bloco individual (além do `validate` do próprio
 *    Registry) — útil para verificar referências cruzadas (agente, canal).
 *
 * Novos validadores se registram uma única vez em tempo de carga (import
 * side-effect) e o engine os consulta a cada análise. Nenhum arquivo do
 * engine precisa mudar para adicionar regras.
 */
import type { BuilderEdge, BuilderNode } from "../state/types";
import type { FlowIssue } from "./engine";

export interface GraphContext {
  agents: Array<{ id: string; name: string; is_active?: boolean }>;
  channels: Array<{ id: string; name: string }>;
  /** FB-10.4C — fluxos disponíveis para conexão + flowId atual (autorreferência). */
  flows?: Array<{ id: string; name: string; status: string }>;
  flowId?: string;
}


export interface GraphRuleInput {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  ctx: GraphContext;
  emit: (issue: FlowIssue) => void;
}
export interface GraphRule {
  id: string;
  run: (input: GraphRuleInput) => void;
}

export interface BlockRuleInput {
  node: BuilderNode;
  edges: BuilderEdge[];
  ctx: GraphContext;
  emit: (issue: FlowIssue) => void;
}
export interface BlockRule {
  id: string;
  /** kind do bloco alvo — `*` para todos. */
  kind: string;
  run: (input: BlockRuleInput) => void;
}

class ValidatorRegistry {
  private _graph: GraphRule[] = [];
  private _block = new Map<string, BlockRule[]>();

  registerGraph(rule: GraphRule) {
    if (this._graph.some((r) => r.id === rule.id)) return;
    this._graph.push(rule);
  }

  registerBlock(rule: BlockRule) {
    const list = this._block.get(rule.kind) ?? [];
    if (list.some((r) => r.id === rule.id)) return;
    list.push(rule);
    this._block.set(rule.kind, list);
  }

  graphRules(): GraphRule[] {
    return this._graph;
  }

  blockRules(kind: string): BlockRule[] {
    return [...(this._block.get(kind) ?? []), ...(this._block.get("*") ?? [])];
  }

  /** Somente para testes. */
  _reset() {
    this._graph = [];
    this._block.clear();
  }
}

export const validatorRegistry = new ValidatorRegistry();
