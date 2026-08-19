/**
 * FB-12.1 — Fonte canônica ÚNICA dos kinds do Flow Builder.
 *
 * Antes do FB-12.1 havia N fontes de verdade paralelas para "quais tipos
 * de blocos existem":
 *   - blocks/definitions.ts (BLOCKS[].kind) — UI/Registry
 *   - canvas/v3/tokens.ts (V3_KINDS) — visual
 *   - lib/flow-executor.server.ts (NODE_PLUGINS) — runtime
 *   - lib/flows.functions.ts (VALID_NODE_KINDS) — persistência
 *
 * Elas divergiram: FB-10.4A/B/C/D adicionou `menu`, `action`,
 * `flow_connection`, `randomizer` em Registry/V3/Runtime, mas esqueceu
 * de atualizar VALID_NODE_KINDS. Resultado: o save-fn `saveFlowGraph`
 * rejeitava qualquer fluxo que usasse esses blocos (P0 do Gate Visual).
 *
 * Este módulo é a fonte canônica. Todos os demais consumidores devem
 * derivar daqui, e um teste anti-regressão em
 * `__tests__/kinds-parity.test.ts` falha automaticamente se algum
 * consumidor (definitions/V3/runtime/persistência) divergir.
 *
 * REGRA: adicionar novo bloco = adicionar aqui primeiro.
 */

/**
 * Kinds oficiais e persistíveis. `node_type` no banco DEVE ser um destes
 * ou um alias legado (ver `LEGACY_KIND_ALIASES`).
 */
export const CANONICAL_BLOCK_KINDS = [
  // Controle
  "start",
  "end",
  // Conteúdo
  "message",
  "question",
  "send_image",
  "send_audio",
  "send_video",
  "send_document",
  // Fluxo/Lógica
  "menu",
  "condition",
  "randomizer",
  "flow_connection",
  // Ação/Automação
  "action",
  "tag",
  "assign_agent",
  "transfer",
  "transfer_number",

  // Tempo
  "wait",
  "wait_reply",
  // Integração / IA
  "http_request",
  "webhook",
  "ai",
] as const;

export type CanonicalBlockKind = (typeof CANONICAL_BLOCK_KINDS)[number];

/**
 * Aliases legados aceitos pela persistência para preservar linhas
 * antigas em `flow_nodes.node_type`. O runtime já os resolve em
 * `NODE_PLUGINS`. Nunca gerados pela UI nova — apenas lidos.
 */
export const LEGACY_KIND_ALIASES = [
  "send_message",   // → message
  "add_tag",        // → tag
  "apply_tag",      // → tag
  "transfer_human", // → transfer
  "run_agent",      // → ai
  "subflow",        // → flow_connection
  "split",          // → randomizer
  "smart_delay",    // → wait
  "integration",    // → http_request
  "api_call",       // → http_request
  "ai_agent",       // → ai
  "assistant_gpt",  // → ai
  "gpt",            // → ai
  "container_block",
] as const;

export type LegacyKindAlias = (typeof LEGACY_KIND_ALIASES)[number];

/**
 * Conjunto completo aceito pela camada de persistência
 * (canônicos + aliases legados).
 */
export const PERSISTABLE_NODE_KINDS = [
  ...CANONICAL_BLOCK_KINDS,
  ...LEGACY_KIND_ALIASES,
] as const;

export type PersistableNodeKind = (typeof PERSISTABLE_NODE_KINDS)[number];

const canonicalSet = new Set<string>(CANONICAL_BLOCK_KINDS);
const persistableSet = new Set<string>(PERSISTABLE_NODE_KINDS);

export function isCanonicalKind(kind: string): kind is CanonicalBlockKind {
  return canonicalSet.has(kind);
}

export function isPersistableKind(kind: string): kind is PersistableNodeKind {
  return persistableSet.has(kind);
}
