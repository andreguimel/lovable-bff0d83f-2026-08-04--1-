/**
 * FB-07 — Regras built-in de validação de grafo e cross-referências.
 *
 * Categorias cobertas:
 *   estruturais: start ausente / múltiplos, sem término, órfãos,
 *   inacessíveis, ciclos não intencionais, conexões inválidas.
 *   referências: agente / canal inexistentes, variáveis desconhecidas.
 *
 * Cada regra é modular — remover ou adicionar novas não afeta o resto.
 */
import { blockRegistry } from "../blocks/registry";
import { validatorRegistry } from "./registry";
import type { BuilderEdge, BuilderNode } from "../state/types";
import type { FlowIssue } from "./engine";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function isStart(n: BuilderNode): boolean {
  const def = blockRegistry.get(n.kind);
  const inSlots = def?.meta.handles.in ?? 1;
  return n.kind === "start" || inSlots === 0;
}
function isTerminal(n: BuilderNode): boolean {
  const def = blockRegistry.get(n.kind);
  return (def?.meta.handles.out.length ?? 1) === 0;
}
function labelOf(n: BuilderNode): string {
  const def = blockRegistry.get(n.kind);
  const custom = (n.data as { label?: string }).label;
  return custom || def?.meta.label || n.kind;
}

// ==================================================================
// GRAPH RULES
// ==================================================================

/** G01 — Deve existir exatamente um nó de início. */
validatorRegistry.registerGraph({
  id: "graph:start",
  run: ({ nodes, emit }) => {
    const starts = nodes.filter(isStart);
    if (nodes.length === 0) {
      emit({
        id: "graph:empty",
        ruleId: "graph:start",
        severity: "error",
        title: "Fluxo vazio",
        detail:
          "Adicione ao menos um bloco de Início e um caminho até um encerramento antes de publicar.",
      });
      return;
    }
    if (starts.length === 0) {
      emit({
        id: "graph:no-start",
        ruleId: "graph:start",
        severity: "error",
        title: "Fluxo sem início",
        detail:
          "Nenhum bloco de Início foi encontrado. Adicione um bloco de Início conectado ao primeiro passo do atendimento.",
      });
    } else if (starts.length > 1) {
      for (const s of starts.slice(1)) {
        emit({
          id: `graph:multi-start:${s.id}`,
          ruleId: "graph:start",
          severity: "error",
          nodeId: s.id,
          title: "Mais de um bloco de Início",
          detail:
            "Um fluxo só pode ter um ponto de partida. Remova os blocos de Início extras para poder publicar.",
        });
      }
    }
  },
});

/** G02 — Deve existir ao menos um terminal alcançável. */
validatorRegistry.registerGraph({
  id: "graph:terminal",
  run: ({ nodes, emit }) => {
    if (nodes.length === 0) return;
    const anyTerminal = nodes.some(isTerminal);
    if (!anyTerminal) {
      emit({
        id: "graph:no-terminal",
        ruleId: "graph:terminal",
        severity: "warning",
        title: "Fluxo sem término explícito",
        detail:
          "Nenhum bloco encerra o atendimento. Adicione um bloco de Encerrar ou de Transferir para tornar o final do fluxo previsível.",
      });
    }
  },
});

/** G03 — Nós órfãos (sem conexão de entrada nem de saída). */
validatorRegistry.registerGraph({
  id: "graph:orphan",
  run: ({ nodes, edges, emit }) => {
    const hasEdge = new Set<string>();
    for (const e of edges) {
      hasEdge.add(e.source);
      hasEdge.add(e.target);
    }
    for (const n of nodes) {
      if (isStart(n)) continue;
      if (!hasEdge.has(n.id)) {
        emit({
          id: `graph:orphan:${n.id}`,
          ruleId: "graph:orphan",
          severity: "warning",
          nodeId: n.id,
          title: `Bloco "${labelOf(n)}" está solto no canvas`,
          detail:
            "Este bloco não está conectado a nada. Ligue-o ao fluxo ou remova-o para evitar confusão.",
        });
      }
    }
  },
});

/** G04 — Ramos inacessíveis (não alcançados a partir de um Início). */
validatorRegistry.registerGraph({
  id: "graph:unreachable",
  run: ({ nodes, edges, emit }) => {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const visited = new Set<string>();
    const queue: string[] = [];
    for (const n of nodes) if (isStart(n)) {
      visited.add(n.id);
      queue.push(n.id);
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
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (isStart(n)) continue;
      if (visited.has(n.id)) continue;
      // órfãos já foram reportados — evitar duplicar
      const hasAnyEdge = edges.some(
        (e) => e.source === n.id || e.target === n.id,
      );
      if (!hasAnyEdge) continue;
      emit({
        id: `graph:unreachable:${n.id}`,
        ruleId: "graph:unreachable",
        severity: "warning",
        nodeId: n.id,
        title: `Bloco "${labelOf(n)}" nunca será executado`,
        detail:
          "Existe um caminho até este bloco, mas nenhum caminho parte do Início até ele. Reconecte o fluxo ou remova o bloco.",
      });
    }
    // silêncio: nodeById existe para uso futuro em detalhes (chain path).
    void nodeById;
  },
});

/** G05 — Ciclos (loops sem saída para o restante do fluxo). */
validatorRegistry.registerGraph({
  id: "graph:cycle",
  run: ({ nodes, edges, emit }) => {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const n of nodes) color.set(n.id, WHITE);
    const reportedNodes = new Set<string>();

    function dfs(id: string, stack: string[]) {
      color.set(id, GRAY);
      stack.push(id);
      for (const nxt of adj.get(id) ?? []) {
        if (color.get(nxt) === GRAY) {
          // ciclo detectado: nxt -> ... -> id -> nxt
          const idx = stack.indexOf(nxt);
          const cycle = stack.slice(idx);
          for (const nid of cycle) {
            if (reportedNodes.has(nid)) continue;
            reportedNodes.add(nid);
          }
          const first = cycle[0];
          emit({
            id: `graph:cycle:${cycle.slice().sort().join(",")}`,
            ruleId: "graph:cycle",
            severity: "warning",
            nodeId: first,
            title: "Loop detectado no fluxo",
            detail: `Existe um ciclo entre ${cycle.length} bloco(s). Se for intencional (retentativa), ignore este aviso; caso contrário, insira uma condição de saída para evitar loop infinito.`,
          });
        } else if (color.get(nxt) === WHITE) {
          dfs(nxt, stack);
        }
      }
      color.set(id, BLACK);
      stack.pop();
    }

    for (const n of nodes) {
      if (color.get(n.id) === WHITE) dfs(n.id, []);
    }
  },
});

/** G06 — Conexões inválidas (endpoints inexistentes ou self-loop trivial). */
validatorRegistry.registerGraph({
  id: "graph:edges",
  run: ({ nodes, edges, emit }) => {
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) {
        emit({
          id: `graph:edge-broken:${e.id}`,
          ruleId: "graph:edges",
          severity: "error",
          edgeId: e.id,
          title: "Conexão apontando para bloco inexistente",
          detail:
            "Uma conexão referencia um bloco que não existe mais. Recrie a conexão entre os blocos corretos.",
        });
        continue;
      }
      if (e.source === e.target) {
        emit({
          id: `graph:edge-self:${e.id}`,
          ruleId: "graph:edges",
          severity: "warning",
          edgeId: e.id,
          nodeId: e.source,
          title: "Bloco conectado a si mesmo",
          detail:
            "Este bloco está ligado à sua própria entrada. Isso normalmente gera loop infinito. Remova a conexão ou insira uma condição intermediária.",
        });
      }
    }
    // handles inexistentes
    for (const e of edges) {
      const src = nodes.find((n) => n.id === e.source);
      if (!src) continue;
      const def = blockRegistry.get(src.kind);
      if (!def) continue;
      const handles = def.meta.handles.out.map((h) => h.id);
      if (e.sourceHandle && !handles.includes(e.sourceHandle)) {
        emit({
          id: `graph:edge-handle:${e.id}`,
          ruleId: "graph:edges",
          severity: "warning",
          edgeId: e.id,
          nodeId: e.source,
          title: "Conexão saindo de uma saída que não existe mais",
          detail: `O bloco não expõe mais a saída "${e.sourceHandle}". Reconecte a partir de uma saída válida.`,
        });
      }
    }
  },
});

/** G07 — Blocos com múltiplas saídas mas apenas uma conectada (info). */
validatorRegistry.registerGraph({
  id: "graph:branch-coverage",
  run: ({ nodes, edges, emit }) => {
    const bySource = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!bySource.has(e.source)) bySource.set(e.source, new Set());
      bySource.get(e.source)!.add(e.sourceHandle ?? "default");
    }
    for (const n of nodes) {
      const def = blockRegistry.get(n.kind);
      const outs = def?.meta.handles.out ?? [];
      if (outs.length <= 1) continue;
      const used = bySource.get(n.id) ?? new Set();
      const missing = outs.filter((h) => !used.has(h.id));
      if (missing.length === 0) continue;
      emit({
        id: `graph:branch:${n.id}`,
        ruleId: "graph:branch-coverage",
        severity: "info",
        nodeId: n.id,
        title: `"${labelOf(n)}" tem saídas sem destino`,
        detail: `As saídas ${missing.map((m) => `"${m.label ?? m.id}"`).join(", ")} não estão conectadas. Ligue-as para cobrir todos os cenários possíveis.`,
      });
    }
  },
});

/** G08 — Terminais nunca alcançáveis a partir do Início (info). */
validatorRegistry.registerGraph({
  id: "graph:terminal-reachable",
  run: ({ nodes, edges, emit }) => {
    if (!nodes.some(isTerminal)) return;
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const visited = new Set<string>();
    const queue: string[] = [];
    for (const n of nodes) if (isStart(n)) {
      visited.add(n.id);
      queue.push(n.id);
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
    const anyTerminalReached = nodes.some(
      (n) => isTerminal(n) && visited.has(n.id),
    );
    if (!anyTerminalReached) {
      emit({
        id: "graph:no-terminal-reached",
        ruleId: "graph:terminal-reachable",
        severity: "warning",
        title: "Nenhum caminho chega até o término",
        detail:
          "O fluxo tem blocos de término, mas nenhum é alcançado a partir do Início. Verifique se as conexões cobrem o caminho principal.",
      });
    }
  },
});

// ==================================================================
// BLOCK RULES — referências cruzadas
// ==================================================================

/** B01 — assign_agent aponta para agente existente e ativo. */
validatorRegistry.registerBlock({
  id: "block:assign-agent-ref",
  kind: "assign_agent",
  run: ({ node, ctx, emit }) => {
    const id = (node.data as { agent_id?: string }).agent_id;
    if (!id) return; // já coberto por validate() do bloco
    const found = ctx.agents.find((a) => a.id === id);
    if (!found) {
      emit({
        id: `ref:agent:${node.id}`,
        ruleId: "block:assign-agent-ref",
        severity: "error",
        nodeId: node.id,
        path: "agent_id",
        title: "Atendente referenciado não existe mais",
        detail:
          "O atendente configurado neste bloco foi removido. Escolha outro atendente para poder publicar.",
      });
    } else if (found.is_active === false) {
      emit({
        id: `ref:agent-inactive:${node.id}`,
        ruleId: "block:assign-agent-ref",
        severity: "warning",
        nodeId: node.id,
        path: "agent_id",
        title: `Atendente "${found.name}" está inativo`,
        detail:
          "Este atendente está desativado. As conversas atribuídas a ele podem ficar sem responsável.",
      });
    }
  },
});

/** B02 — variáveis referenciadas ({{contact.name}}) — só INFO. */
const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;
const KNOWN_VAR_PREFIXES = [
  "contact",
  "ai",
  "last_reply",
  "last_message",
  "conversation",
  "flow",
  "channel",
  "agent",
  "trigger",
];
validatorRegistry.registerBlock({
  id: "block:vars",
  kind: "*",
  run: ({ node, emit }) => {
    for (const [key, val] of Object.entries(node.data)) {
      if (typeof val !== "string") continue;
      const matches = val.matchAll(VAR_RE);
      const bad = new Set<string>();
      for (const m of matches) {
        const path = m[1];
        const prefix = path.split(".")[0];
        if (!KNOWN_VAR_PREFIXES.includes(prefix)) bad.add(path);
      }
      for (const path of bad) {
        emit({
          id: `ref:var:${node.id}:${key}:${path}`,
          ruleId: "block:vars",
          severity: "info",
          nodeId: node.id,
          path: key,
          title: `Variável "${path}" pode não existir`,
          detail: `Verifique a grafia. Variáveis reconhecidas começam com: ${KNOWN_VAR_PREFIXES.join(", ")}.`,
        });
      }
    }
  },
});

/** B03 — flow_connection: destino existe, não é autorreferência, não é arquivado. */
validatorRegistry.registerBlock({
  id: "block:flow-connection-ref",
  kind: "flow_connection",
  run: ({ node, ctx, emit }) => {
    const targetId = (node.data as { target_flow_id?: string }).target_flow_id;
    if (!targetId) return; // já coberto por validate() do bloco
    if (ctx.flowId && targetId === ctx.flowId) {
      emit({
        id: `ref:flow-self:${node.id}`,
        ruleId: "block:flow-connection-ref",
        severity: "error",
        nodeId: node.id,
        path: "target_flow_id",
        title: "Este fluxo não pode iniciar a si mesmo",
        detail: "Escolha outro fluxo de destino para evitar loops infinitos.",
      });
      return;
    }
    const list = ctx.flows ?? [];
    if (list.length === 0) return; // sem contexto de fluxos: não bloquear
    const target = list.find((f) => f.id === targetId);
    if (!target) {
      emit({
        id: `ref:flow-missing:${node.id}`,
        ruleId: "block:flow-connection-ref",
        severity: "error",
        nodeId: node.id,
        path: "target_flow_id",
        title: "O fluxo selecionado não está disponível",
        detail:
          "O fluxo destino não existe mais nesta empresa ou foi movido. Selecione outro fluxo.",
      });
      return;
    }
    if (target.status === "archived") {
      emit({
        id: `ref:flow-archived:${node.id}`,
        ruleId: "block:flow-connection-ref",
        severity: "error",
        nodeId: node.id,
        path: "target_flow_id",
        title: `Fluxo "${target.name}" está arquivado`,
        detail: "Fluxos arquivados não podem ser iniciados. Escolha um fluxo ativo.",
      });
    }
  },
});

/** B04 — randomizer: cada caminho com peso > 0 precisa de edge conectada. */
validatorRegistry.registerBlock({
  id: "block:randomizer-edges",
  kind: "randomizer",
  run: ({ node, edges, emit }) => {
    const raw = (node.data as { routes?: unknown }).routes;
    if (!Array.isArray(raw)) return;
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const route = r as { id?: string; label?: string; weight?: number };
      if (!route.id) continue;
      const weight = typeof route.weight === "number" ? route.weight : 0;
      if (weight <= 0) continue;
      const connected = edges.some(
        (e) => e.source === node.id && e.sourceHandle === route.id,
      );
      if (!connected) {
        emit({
          id: `ref:randomizer-edge:${node.id}:${route.id}`,
          ruleId: "block:randomizer-edges",
          severity: "error",
          nodeId: node.id,
          path: "routes",
          title: `O caminho "${route.label || route.id}" não está conectado`,
          detail:
            "Conecte a saída deste caminho a outro bloco ou remova-o para poder publicar.",
        });
      }
    }
  },
});


