/**
 * FB-02 — Contrato canônico de um bloco do Flow Builder V2.
 *
 * Todo bloco (novo ou migrado) deve nascer implementando esta interface.
 * Nada mais pode ser registrado manualmente fora do registry.
 */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { z } from "zod";
import type { FieldSpec } from "../fields/types";


export type BlockCategory =
  | "channels"
  | "logic"
  | "ai"
  | "crm"
  | "integrations"
  | "system";

export interface HandleSpec {
  /** id do handle (`default`, `true`, `false`, `case:1`, …) */
  id: string;
  /** rótulo curto exibido próximo ao handle */
  label?: string;
}

export interface BlockHandles {
  in: 0 | 1;
  out: HandleSpec[];
}

export interface ValidationIssue {
  path?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface NodePresentationProps<TData> {
  id: string;
  data: TData;
  selected: boolean;
  invalid: boolean;
  running: boolean;
}

export interface InspectorProps<TData> {
  nodeId: string;
  data: TData;
  onChange: (patch: Partial<TData>) => void;
}

export interface BlockMetaV2<TData> {
  label: string;
  short: string;
  category: BlockCategory;
  icon: LucideIcon;
  /** cor accent (oklch) — reutilizada em Node, Inspector, library */
  accent: string;
  handles: BlockHandles;
  defaults: TData;
  /**
   * FB-06 — dicas orientadas ao usuário de negócio. Consumidas por
   * preview do card, biblioteca de blocos e futura camada de IA.
   */
  hints?: {
    /** exemplos curtos "Ex: ..." exibidos na biblioteca e preview */
    examples?: string[];
    /** frase única "quando usar" — futura assistência contextual */
    whenToUse?: string;
  };
}

/**
 * FB-06 — Estado agregado do bloco (derivado da validação).
 * `configured` (verde), `incomplete` (obrigatório vazio) e `attention`
 * (warning) tornam explícito para o usuário o que falta para o fluxo
 * publicar. `error` continua reservado a erros duros.
 */
export type BlockStatus = "configured" | "incomplete" | "attention" | "error";

/**
 * FB-06 — Ganchos declarativos preparados para a camada de IA.
 * Nenhum consumidor implementa hoje; existir aqui garante que qualquer
 * bloco novo já nasça "AI-ready" (sugestão, geração, explicação).
 */
export interface BlockAIAssist<TData> {
  /** frase curta explicando o que o bloco faz em linguagem natural */
  explain?: (data: TData) => string;
  /** sugestões de preenchimento que a IA pode oferecer no painel */
  suggests?: (data: TData) => Array<{ label: string; patch: Partial<TData> }>;
  /** rótulo do botão "Gerar com IA" quando aplicável (ex: mensagem) */
  generateLabel?: string;
}

/**
 * Definição completa de um bloco. Todos os campos são opcionais exceto
 * `kind` e `meta` para permitir migração incremental (FB-03/FB-04).
 * O Registry aplica defaults seguros quando o bloco ainda não fornece
 * `Node`/`Inspector`/`validate`.
 */
export interface BlockDefinition<TData = Record<string, unknown>> {
  /** mesmo valor de `flow_nodes.node_type` no banco */
  kind: string;
  meta: BlockMetaV2<TData>;

  /** validação estrutural (schema Zod) */
  schema?: z.ZodType<TData>;
  /** validação de negócio local — só olha para si mesmo */
  validate?: (data: TData) => ValidationResult;
  /** string curta exibida no card do canvas */
  preview?: (data: TData) => string | null;
  /** FB-06 — estado derivado (default: baseado em `validate`) */
  status?: (data: TData) => BlockStatus;
  /**
   * FB-10.4 — handles derivados dos dados da instância (ex.: bloco Menu
   * produz uma saída por opção). Quando ausente, o canvas usa
   * `meta.handles` como conjunto fixo. NUNCA muta `meta`.
   */
  getHandles?: (data: TData) => BlockHandles;

  /** renderização no canvas */
  Node?: ComponentType<NodePresentationProps<TData>>;
  /** form de edição exibido no painel lateral (opcional — override total) */
  Inspector?: ComponentType<InspectorProps<TData>>;
  /**
   * FB-04 — descrição declarativa de campos consumida pelo SmartSidebar.
   * Preferir esta forma; `Inspector` fica reservado a casos exóticos.
   */
  fields?: FieldSpec[];

  /** FB-06 — ganchos para a futura camada de assistência IA (arch-only) */
  aiAssist?: BlockAIAssist<TData>;

  /** conversores opcionais bloco→banco (default: identidade) */
  toServer?: (data: TData) => Record<string, unknown>;
  fromServer?: (data: Record<string, unknown>) => TData;
}


