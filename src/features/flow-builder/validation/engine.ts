/**
 * FB-07 — Motor de validação pré-voo do Flow Builder.
 *
 * Responsabilidades:
 *  - Percorrer o grafo em memória (snapshot da store) e produzir um
 *    relatório estruturado (errors / warnings / infos + score 0-100).
 *  - Ser extensível: novos validadores se registram via `validatorRegistry`
 *    sem alterar este arquivo.
 *  - Ser rápido: memoiza o último snapshot analisado (hash barato por
 *    contagens + versão dirty da store) — chamadas repetidas com o
 *    mesmo grafo devolvem o mesmo relatório instantaneamente.
 *
 * NÃO altera Runtime, Executor, Banco ou schema — a validação vive
 * apenas dentro do Builder.
 */
import { blockRegistry } from "../blocks/registry";
import type { BuilderEdge, BuilderNode } from "../state/types";
import type { ValidationIssue } from "../blocks/types";
import { validatorRegistry, type GraphContext } from "./registry";
import "./rules"; // side-effect: registra regras built-in

export type IssueSeverity = "error" | "warning" | "info";

export interface FlowIssue {
  /** id único, estável para navegação/keying (`rule:nodeId?:path?`). */
  id: string;
  /** id da regra que emitiu — permite futura silenciação por regra. */
  ruleId: string;
  severity: IssueSeverity;
  /** título curto acionável ("Fluxo sem início"). */
  title: string;
  /** explicação e sugestão de correção. */
  detail: string;
  /** bloco associado (quando aplicável). */
  nodeId?: string;
  /** aresta associada (quando aplicável). */
  edgeId?: string;
  /** campo dentro do bloco (para abrir o SmartSidebar já no ponto). */
  path?: string;
}

export interface FlowHealthReport {
  errors: FlowIssue[];
  warnings: FlowIssue[];
  infos: FlowIssue[];
  /** 0-100. 100 = pronto para publicar sem ressalvas. */
  score: number;
  /** métricas úteis para o card resumo + relatório de publicação. */
  metrics: {
    nodeCount: number;
    edgeCount: number;
    startCount: number;
    terminalCount: number;
    orphanCount: number;
    unreachableCount: number;
  };
  /** true quando não há erros — publicação liberada. */
  canPublish: boolean;
  /** carimbo de quando foi calculado (ms). */
  computedAt: number;
}

// ------------------------------------------------------------------
// Cache incremental
// ------------------------------------------------------------------
let cacheKey: string | null = null;
let cacheReport: FlowHealthReport | null = null;

function snapshotKey(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  ctx: GraphContext,
): string {
  // Hash barato: contagens + ids + kind + JSON.stringify de data (curto na prática).
  // Suficiente para invalidar quando algo muda.
  const nk = nodes
    .map((n) => `${n.id}:${n.kind}:${JSON.stringify(n.data)}`)
    .join("|");
  const ek = edges
    .map((e) => `${e.id}:${e.source}>${e.target}#${e.sourceHandle ?? ""}`)
    .join("|");
  const ck = `A${ctx.agents.length}:C${ctx.channels.length}:F${(ctx.flows ?? []).length}:${ctx.flowId ?? ""}`;
  return `${nk}::${ek}::${ck}`;

}

// ------------------------------------------------------------------
// Analyzer
// ------------------------------------------------------------------
export function analyzeFlow(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  ctx: GraphContext,
  options?: { force?: boolean },
): FlowHealthReport {
  const key = snapshotKey(nodes, edges, ctx);
  if (!options?.force && key === cacheKey && cacheReport) return cacheReport;

  const raw: FlowIssue[] = [];
  const push = (i: FlowIssue) => raw.push(i);

  // 1) Regras estruturais do grafo (registradas em ./rules)
  for (const rule of validatorRegistry.graphRules()) {
    try {
      rule.run({ nodes, edges, ctx, emit: push });
    } catch (e) {
      push({
        id: `rule-error:${rule.id}`,
        ruleId: rule.id,
        severity: "warning",
        title: "Regra de validação falhou",
        detail: `A regra "${rule.id}" lançou um erro: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    }
  }

  // 2) Validação por bloco (do próprio Registry — cada bloco valida a si mesmo)
  for (const node of nodes) {
    const def = blockRegistry.get(node.kind);
    if (!def?.validate) continue;
    let result;
    try {
      result = def.validate(node.data);
    } catch (e) {
      push({
        id: `block-crash:${node.id}`,
        ruleId: "block:crash",
        nodeId: node.id,
        severity: "error",
        title: `Bloco "${def.meta.label}" não pôde ser validado`,
        detail: `O bloco lançou uma exceção durante a validação: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
      continue;
    }
    for (const issue of result.issues) {
      push(toFlowIssue(node, def.meta.label, issue));
    }
    // 3) Validadores adicionais registrados para este kind
    for (const rule of validatorRegistry.blockRules(node.kind)) {
      try {
        rule.run({ node, edges, ctx, emit: push });
      } catch (e) {
        push({
          id: `rule-error:${rule.id}:${node.id}`,
          ruleId: rule.id,
          nodeId: node.id,
          severity: "warning",
          title: "Regra de validação falhou",
          detail: `${rule.id}: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  // 4) Deduplicação por id
  const seen = new Set<string>();
  const issues = raw.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  const metrics = computeMetrics(nodes, edges);
  const score = computeScore({
    nodeCount: metrics.nodeCount,
    errors: errors.length,
    warnings: warnings.length,
    infos: infos.length,
  });

  const report: FlowHealthReport = {
    errors,
    warnings,
    infos,
    score,
    metrics,
    canPublish: errors.length === 0,
    computedAt: Date.now(),
  };

  cacheKey = key;
  cacheReport = report;
  return report;
}

/** Limpa o cache (usado por testes e trocas de fluxo). */
export function resetAnalyzerCache() {
  cacheKey = null;
  cacheReport = null;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function toFlowIssue(
  node: BuilderNode,
  label: string,
  raw: ValidationIssue,
): FlowIssue {
  const severity: IssueSeverity = raw.severity;
  return {
    id: `block:${node.id}:${raw.path ?? "-"}:${severity}`,
    ruleId: `block:${node.kind}`,
    nodeId: node.id,
    path: raw.path,
    severity,
    title: `${label}: ${raw.message}`,
    detail: raw.message,
  };
}

function computeMetrics(nodes: BuilderNode[], edges: BuilderEdge[]) {
  let startCount = 0;
  let terminalCount = 0;
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const e of edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1);
  }
  for (const n of nodes) {
    const def = blockRegistry.get(n.kind);
    const outSlots = def?.meta.handles.out.length ?? 1;
    const inSlots = def?.meta.handles.in ?? 1;
    if (inSlots === 0 || n.kind === "start") startCount++;
    if (outSlots === 0) terminalCount++;
  }

  // reachability (BFS a partir de qualquer nó com in=0/start)
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const n of nodes) {
    const def = blockRegistry.get(n.kind);
    const inSlots = def?.meta.handles.in ?? 1;
    if (inSlots === 0 || n.kind === "start") {
      queue.push(n.id);
      visited.add(n.id);
    }
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }
  let orphanCount = 0;
  let unreachableCount = 0;
  for (const n of nodes) {
    const hasIn = (incoming.get(n.id) ?? 0) > 0;
    const hasOut = (outgoing.get(n.id) ?? 0) > 0;
    const def = blockRegistry.get(n.kind);
    const inSlots = def?.meta.handles.in ?? 1;
    if (!hasIn && !hasOut && n.kind !== "start" && inSlots !== 0) orphanCount++;
    else if (!visited.has(n.id) && n.kind !== "start") unreachableCount++;
  }

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    startCount,
    terminalCount,
    orphanCount,
    unreachableCount,
  };
}

function computeScore(x: {
  nodeCount: number;
  errors: number;
  warnings: number;
  infos: number;
}): number {
  if (x.nodeCount === 0) return 0;
  // Penalidade proporcional ao tamanho do fluxo, com pisos.
  const errPenalty = Math.min(100, x.errors * 20);
  const warnPenalty = Math.min(30, x.warnings * 5);
  const infoPenalty = Math.min(10, x.infos * 1);
  const raw = 100 - errPenalty - warnPenalty - infoPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
