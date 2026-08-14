/**
 * FB-04 — Biblioteca universal de campos (contrato declarativo).
 *
 * Todo bloco descreve seu Inspector como uma lista de `FieldSpec`.
 * O SmartSidebar renderiza a lista com componentes base — nenhum
 * bloco cria Input/Select/Upload próprio.
 *
 * Regra de escala: os 17 blocos atuais e os futuros (CRM, IA, Inbox)
 * usam exatamente estes tipos. Adicionar um novo tipo aqui = ganho
 * imediato em toda a plataforma.
 */
import type { MediaKind } from "@/components/flows/media-picker";

export interface SidebarCtx {
  flowId: string;
  agents: Array<{ id: string; name: string; is_active: boolean }>;
  channels: Array<{ id: string; name: string }>;
  /** FB-10.4B — etiquetas do tenant (para bloco Ação · Adicionar/Remover etiqueta). */
  tags?: Array<{ id: string; name: string; color?: string | null }>;
  /** FB-10.4B — membros do time (para bloco Ação · Atribuir atendente). */
  members?: Array<{ id: string; name: string; email?: string | null }>;
  /** FB-10.4C — fluxos do tenant disponíveis para conexão (exclui o atual e arquivados). */
  flows?: Array<{ id: string; name: string; status: string }>;
}


export interface FieldOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface FieldBase {
  /** chave em `node.data` (exceto para `media` e `info`) */
  key?: string;
  label?: string;
  help?: string;
  /** oculta o campo dinamicamente com base nos dados atuais */
  visible?: (data: Record<string, unknown>, ctx: SidebarCtx) => boolean;
}

export interface TextFieldSpec extends FieldBase {
  type: "text";
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
  maxLength?: number;
}

export interface TextAreaFieldSpec extends FieldBase {
  type: "textarea";
  key: string;
  label: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  maxLength?: number;
}

export interface NumberFieldSpec extends FieldBase {
  type: "number";
  key: string;
  label: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  required?: boolean;
}

export interface SelectFieldSpec extends FieldBase {
  type: "select";
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options: FieldOption[] | ((ctx: SidebarCtx) => FieldOption[]);
  emptyMessage?: string;
  /**
   * FB-06 — quando definido, o rótulo da opção escolhida é gravado em
   * `data[persistLabelKey]`. Usado por blocos que exibem o nome legível
   * no preview do card (ex.: IA, Atribuir agente).
   */
  persistLabelKey?: string;
}


export interface SwitchFieldSpec extends FieldBase {
  type: "switch";
  key: string;
  label: string;
  description?: string;
}

/**
 * V1.2 — Grupo de opções mutuamente exclusivas exibidas empilhadas.
 * Escolhido para configurações operacionais que mudam a estrutura do
 * bloco (ex.: modo de transferência) e cuja lista de opções é curta e
 * precisa ficar visível de uma vez.
 */
export interface RadioFieldSpec extends FieldBase {
  type: "radio";
  key: string;
  label: string;
  required?: boolean;
  options: FieldOption[];
}


export interface MediaFieldSpec extends FieldBase {
  type: "media";
  mediaKind: MediaKind;
  /** legenda opcional adjacente (grava em `caption`) */
  withCaption?: boolean;
}

export interface InfoFieldSpec extends FieldBase {
  type: "info";
  text: string;
  variant?: "info" | "warning";
}

/**
 * FB-10.4A — Lista editável de opções (ex.: bloco Menu).
 * Cada item tem `id` estável (nunca renumera) e `label` humano.
 * O renderer garante mínimo/máximo e emite patch sob a chave `key`.
 */
export interface MenuOptionsFieldSpec extends FieldBase {
  type: "menu_options";
  key: string;
  label?: string;
  min?: number;
  max?: number;
}

/**
 * FB-10.4D — Lista de rotas ponderadas do bloco Randomizador.
 * Cada rota tem `id` estável (nunca renumera), `label` humano e `weight`
 * percentual. O renderer mostra o total em tempo real e exige soma = 100.
 */
export interface RandomizerRoutesFieldSpec extends FieldBase {
  type: "randomizer_routes";
  key: string;
  label?: string;
  min?: number;
  max?: number;
}

/**
 * FB-V1.3 — Intervalo de tempo (número + unidade), no padrão "Entrada expira
 * em 1 Dias". Grava o número em `key` e a unidade em `unitKey`
 * (`seconds|minutes|hours|days`).
 */
export interface DurationFieldSpec extends FieldBase {
  type: "duration";
  key: string;
  unitKey: string;
  label: string;
  min?: number;
  max?: number;
  /** quando true, permite limpar o número (sem expiração) */
  clearable?: boolean;
}

export interface ConditionBuilderFieldSpec extends FieldBase {
  type: "condition_builder";
}

export interface ContentBuilderFieldSpec extends FieldBase {
  type: "content_builder";
}

export type FieldSpec =
  | TextFieldSpec
  | TextAreaFieldSpec
  | NumberFieldSpec
  | SelectFieldSpec
  | SwitchFieldSpec
  | RadioFieldSpec
  | MediaFieldSpec
  | InfoFieldSpec
  | MenuOptionsFieldSpec
  | RandomizerRoutesFieldSpec
  | DurationFieldSpec
  | ConditionBuilderFieldSpec
  | ContentBuilderFieldSpec;



/** utilitário compartilhado — considera "" / null / undefined como vazio */
export function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}
