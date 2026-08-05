/**
 * FB-07 — Superfície pública do módulo de validação.
 *
 * Mantém a API antiga (`validateNode`, `validateGraph`, `collectIssues`)
 * para compatibilidade com FB-02/FB-04 e expõe o novo motor pré-voo
 * (`analyzeFlow`, `useFlowHealth`).
 */
import { useMemo, useSyncExternalStore } from "react";
import { blockRegistry } from "../blocks/registry";
import { useBuilderStore } from "../state/store";
import type { ValidationIssue, ValidationResult } from "../blocks/types";
import { analyzeFlow, type FlowHealthReport } from "./engine";
import type { GraphContext } from "./registry";

export { analyzeFlow, resetAnalyzerCache } from "./engine";
export type { FlowHealthReport, FlowIssue, IssueSeverity } from "./engine";
export { validatorRegistry } from "./registry";
export type { GraphRule, BlockRule, GraphContext } from "./registry";

// ---- API legada (mantida) ------------------------------------------

export function validateNode(nodeId: string): ValidationResult {
  const node = useBuilderStore.getState().nodesById[nodeId];
  if (!node) return { valid: true, issues: [] };
  return blockRegistry.validate(node.kind, node.data);
}

export interface GraphValidationEntry {
  nodeId: string;
  kind: string;
  result: ValidationResult;
}

export function validateGraph(): GraphValidationEntry[] {
  const s = useBuilderStore.getState();
  const out: GraphValidationEntry[] = [];
  for (const id of s.nodeOrder) {
    const n = s.nodesById[id];
    if (!n) continue;
    out.push({ nodeId: id, kind: n.kind, result: blockRegistry.validate(n.kind, n.data) });
  }
  return out;
}

export function collectIssues(entries: GraphValidationEntry[]): {
  errors: (ValidationIssue & { nodeId: string })[];
  warnings: (ValidationIssue & { nodeId: string })[];
} {
  const errors: (ValidationIssue & { nodeId: string })[] = [];
  const warnings: (ValidationIssue & { nodeId: string })[] = [];
  for (const e of entries) {
    for (const i of e.result.issues) {
      if (i.severity === "error") errors.push({ ...i, nodeId: e.nodeId });
      else warnings.push({ ...i, nodeId: e.nodeId });
    }
  }
  return { errors, warnings };
}

// ---- Hook reativo (FB-07) ------------------------------------------

/**
 * Escuta a store e recomputa o relatório de saúde apenas quando o
 * conteúdo relevante muda. O engine faz o cache em cima disso, então
 * chamadas repetidas para o mesmo grafo são O(1).
 */
export function useFlowHealth(ctx: GraphContext): FlowHealthReport {
  const version = useSyncExternalStore(
    (cb) => useBuilderStore.subscribe(cb),
    () => {
      const s = useBuilderStore.getState();
      // versão barata: order + dirty + last save + selection ignore
      return `${s.nodeOrder.length}:${s.edgeOrder.length}:${s.dirty ? 1 : 0}:${s.meta.flowId ?? ""}:${s.meta.loadedAt ?? 0}:${JSON.stringify(s.nodeOrder)}:${JSON.stringify(s.edgeOrder)}`;
    },
    () => "",
  );
  // O engine memoiza internamente por snapshot exato.
  return useMemo(() => {
    const s = useBuilderStore.getState();
    const nodes = s.nodeOrder.map((id) => s.nodesById[id]).filter(Boolean);
    const edges = s.edgeOrder.map((id) => s.edgesById[id]).filter(Boolean);
    return analyzeFlow(nodes, edges, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ctx.agents, ctx.channels]);
}
