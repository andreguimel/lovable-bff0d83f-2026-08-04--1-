/**
 * FB-10.1 — Tokens do Flow Builder V3.
 *
 * Fonte única do mapeamento visual por categoria e do conjunto de
 * blocos migrados para a nova experiência V3.
 *
 * IMPORTANTE:
 *  - Nenhum dado persistido depende destes tokens (visual apenas).
 *  - Adicionar um kind ao V3_KINDS habilita o novo card para ele —
 *    é feature-flag por bloco, não por fluxo.
 */
import type { BlockCategory } from "../../blocks/types";

/**
 * Categoria semântica usada pelo V3. Deriva de `meta.category` do bloco
 * legacy (BlockCategory) mas com nomes 1:1 com o plano FB-10.
 */
export type FlowCategoryV3 =
  | "system"
  | "content"
  | "menu"
  | "action"
  | "logic"
  | "flow"
  | "random"
  | "wait"
  | "integration"
  | "ai";

/**
 * Kinds migrados para o BlockCardV3.
 * FB-12.1 · derivado da fonte canônica única (blocks/kinds.ts) para
 * eliminar drift entre UI, Runtime e Persistência.
 */
import { CANONICAL_BLOCK_KINDS } from "@/features/flow-builder/blocks/kinds";

export const V3_KINDS: ReadonlySet<string> = new Set<string>(CANONICAL_BLOCK_KINDS);


export function isV3Kind(kind: string): boolean {
  return V3_KINDS.has(kind);
}

/**
 * Categoria V3 derivada do kind + BlockCategory legado.
 *
 * O kind tem precedência (permite reclassificar sem tocar em blocks/definitions.ts).
 * Quando não houver override por kind, cai no mapeamento por BlockCategory.
 */
const KIND_OVERRIDES: Record<string, FlowCategoryV3> = {
  start: "system",
  end: "system",
  wait: "wait",
  wait_reply: "wait",
  condition: "logic",
  ai: "ai",
  http: "integration",
  webhook: "integration",
  transfer: "action",
  transfer_number: "action",

  tag: "action",
  add_tag: "action",
  remove_tag: "action",
  contact_update: "action",
  action: "action",
  menu: "menu",
  flow_connection: "flow",
  randomizer: "random",
};


const CATEGORY_MAP: Record<BlockCategory, FlowCategoryV3> = {
  system: "system",
  channels: "content",
  logic: "logic",
  ai: "ai",
  crm: "action",
  integrations: "integration",
};

export function resolveCategoryV3(
  kind: string,
  category: BlockCategory,
): FlowCategoryV3 {
  return KIND_OVERRIDES[kind] ?? CATEGORY_MAP[category] ?? "system";
}

/** Rótulo humano exibido no header do card. Prioriza o `label` do meta. */
export function displayTitle(kind: string, metaLabel: string, dataLabel?: string): string {
  if (dataLabel && dataLabel.trim()) return dataLabel.trim();
  // Nomes canônicos V3 para blocos-sistema (nunca exibir "start"/"end").
  if (kind === "start") return "Bloco Inicial";
  if (kind === "end") return "Encerrar";
  return metaLabel;
}

/**
 * Sub-rótulo humano exibido abaixo do título. Descreve a NATUREZA do
 * bloco em linguagem de negócio — nunca o kind técnico.
 * O mapa abaixo cobre os 17 kinds atuais (FB-10.3).
 */
const KIND_LABEL_HUMAN: Record<string, string> = {
  start: "Início do fluxo",
  end: "Fim do atendimento",
  message: "Mensagem de texto",
  question: "Pergunta ao contato",
  menu: "Menu de opções",
  action: "Ação de automação",
  send_image: "Envio de imagem",
  send_audio: "Envio de áudio",
  send_video: "Envio de vídeo",
  send_document: "Envio de arquivo",
  wait: "Pausa temporizada",
  wait_reply: "Espera resposta",
  condition: "Regra Sim / Não",
  ai: "Assistente de IA",
  transfer: "Transferência humana",
  transfer_number: "Transferência de número",

  assign_agent: "Atribuição de atendente",
  tag: "Etiqueta de contato",
  http_request: "Chamada de API",
  webhook: "Webhook externo",
  flow_connection: "Conexão de fluxo",
  randomizer: "Divisão aleatória",
};


export function displayKindLabel(kind: string, metaLabel: string): string {
  return KIND_LABEL_HUMAN[kind] ?? metaLabel;
}

/**
 * Rótulo humano para uma saída específica de um handle.
 * Usado por BlockNodeV3 para posicionar rótulos "Sim" / "Não" / "Próximo"
 * ao lado dos PillHandles. Retorna null quando não há rótulo semântico
 * (single-out padrão) — o card não polui a lateral do bloco.
 */
export function displayHandleLabel(kind: string, handleId: string, metaLabel?: string): string | null {
  if (kind === "condition") {
    if (handleId === "true") return "Sim";
    if (handleId === "false") return "Não";
  }
  if (kind === "menu") {
    if (handleId === "invalid") return "Inválido";
    if (metaLabel && metaLabel.trim()) return metaLabel.trim();
    return null;
  }
  if (metaLabel && metaLabel.trim()) {
    return metaLabel.trim().replace(/^\w/, (c) => c.toUpperCase());
  }
  return null;
}

/**
 * FB-12.5 — Resolve o rótulo humano de uma edge a partir da FONTE CANÔNICA
 * (dados do nó de origem). Nunca duplica mapeamentos: lê `options[]` no Menu,
 * `routes[]` no Randomizer e delega ao `displayHandleLabel` nos casos
 * estáticos (Condition true/false, Menu invalid).
 *
 * @param sourceKind kind do bloco de origem.
 * @param sourceData `data` completa do nó de origem (opção/rota vivem aqui).
 * @param handleId  `sourceHandle` da edge (persistido).
 * @returns texto compacto para renderizar na edge, ou null quando não há
 *          semântica útil (single-out padrão).
 */
export function resolveEdgeLabel(
  sourceKind: string,
  sourceData: Record<string, unknown> | undefined | null,
  handleId: string | null | undefined,
): string | null {
  if (!handleId) return null;
  const d = sourceData ?? {};

  if (sourceKind === "condition") {
    if (handleId === "true") return "Sim";
    if (handleId === "false") return "Não";
    return null;
  }

  if (sourceKind === "menu") {
    if (handleId === "invalid") return "Inválido";
    const opts = Array.isArray(d.options)
      ? (d.options as Array<{ id?: unknown; label?: unknown }>)
      : [];
    const match = opts.find((o) => typeof o.id === "string" && o.id === handleId);
    const raw = typeof match?.label === "string" ? match.label.trim() : "";
    return raw || null;
  }

  if (sourceKind === "randomizer") {
    const routes = Array.isArray(d.routes)
      ? (d.routes as Array<{ id?: unknown; label?: unknown; weight?: unknown }>)
      : [];
    const match = routes.find((r) => typeof r.id === "string" && r.id === handleId);
    if (!match) return null;
    const label = typeof match.label === "string" ? match.label.trim() : "";
    const w = typeof match.weight === "number" && Number.isFinite(match.weight) ? match.weight : null;
    if (label && w !== null) return `${label} · ${w}%`;
    return label || null;
  }

  if (sourceKind === "flow_connection") {
    // terminal — sem edges de saída
    return null;
  }

  if (sourceKind === "transfer_number") {
    if (handleId === "success") return "Sucesso";
    if (handleId === "error") return "Erro";
    return null;
  }


  // Fallback: qualquer outro kind com handle nomeado + metadata do handle
  return displayHandleLabel(sourceKind, handleId);
}

/**
 * Tom visual da label (verde/vermelho/neutro) derivado do papel do handle.
 * FB-12.5 — expõe como função pura para os testes.
 */
export function edgeLabelTone(sourceKind: string, handleId: string | null | undefined): "yes" | "no" | "neutral" {
  if (!handleId) return "neutral";
  if (sourceKind === "condition") {
    if (handleId === "true") return "yes";
    if (handleId === "false") return "no";
  }
  if (sourceKind === "menu" && handleId === "invalid") return "no";
  if (sourceKind === "transfer_number") {
    if (handleId === "success") return "yes";
    if (handleId === "error") return "no";
  }
  return "neutral";
}
