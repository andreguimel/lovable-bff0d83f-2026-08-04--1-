/**
 * FB-10.2 — Configuração de categorias visuais da NodeLibraryPanelV3.
 *
 * Fonte única de:
 *  - ordem de exibição das categorias na paleta lateral;
 *  - rótulo humano e descrição curta;
 *  - ícone e cor semântica (reaproveitando FlowCategoryV3 dos tokens V3);
 *  - flag `comingSoon` para categorias cuja funcionalidade ainda não existe.
 *
 * Regras:
 *  - Categorias `comingSoon` NÃO podem inserir blocos no fluxo. Elas
 *    aparecem para comunicar o roadmap sem criar automação fake.
 *  - Blocos vêm sempre do Registry — nenhuma lista manual paralela.
 *  - START é ocultado por padrão (protegido contra criação acidental).
 */
import {
  Bot,
  Clock,
  GitBranch,
  Globe,
  Layers,
  ListTree,
  MessageSquare,
  Shuffle,
  Sparkles,
  StopCircle,
  Wand2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { FlowCategoryV3 } from "../../canvas/v3/tokens";
import { resolveCategoryV3 } from "../../canvas/v3/tokens";
import type { BlockDefinition } from "../../blocks/types";

export interface LibraryCategoryV3 {
  id: FlowCategoryV3;
  label: string;
  description: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  /** Nota curta exibida quando a categoria está indisponível. */
  comingSoonNote?: string;
}

/**
 * Ordem canônica da paleta lateral.
 *
 * `system` fica no fim, agrupando blocos de controle (Encerrar).
 * `menu`, `flow` e `random` são exibidos como "Em breve" — nenhum bloco
 * registrado hoje pertence a essas categorias.
 */
export const V3_LIBRARY_CATEGORIES: LibraryCategoryV3[] = [
  {
    id: "content",
    label: "Conteúdo",
    description: "Envie mensagens, mídias e perguntas ao contato.",
    icon: MessageSquare,
  },
  {
    id: "menu",
    label: "Menu",
    description: "Ofereça opções numeradas ou botões ao contato.",
    icon: ListTree,
  },
  {
    id: "action",
    label: "Ação",
    description: "Ações no CRM, atribuições e transferências.",
    icon: Wand2,
  },
  {
    id: "logic",
    label: "Condição",
    description: "Divida o fluxo com regras Sim / Não.",
    icon: GitBranch,
  },
  {
    id: "flow",
    label: "Conexão de Fluxo",
    description: "Direcione o contato para outro fluxo automatizado.",
    icon: Workflow,
  },

  {
    id: "random",
    label: "Randomizador",
    description: "Distribua contatos automaticamente entre diferentes caminhos.",
    icon: Shuffle,
  },
  {
    id: "wait",
    label: "Atraso Inteligente",
    description: "Pausas fixas ou espera por resposta do contato.",
    icon: Clock,
  },
  {
    id: "integration",
    label: "Integração",
    description: "Chame APIs externas ou dispare webhooks.",
    icon: Globe,
  },
  {
    id: "ai",
    label: "Assistente IA",
    description: "Delegue a resposta a um agente de IA configurado.",
    icon: Bot,
  },
  {
    id: "system",
    label: "Sistema",
    description: "Blocos estruturais do fluxo (Encerrar).",
    icon: Layers,
  },
];

/** Metadados extras exibidos no header do painel. */
export const V3_PANEL_META = {
  title: "Biblioteca de blocos",
  subtitle: "Arraste ou clique para adicionar ao fluxo",
  emptyBadge: Sparkles,
  endIcon: StopCircle,
};

/**
 * Kinds que NÃO devem aparecer na paleta lateral.
 *
 * - `start`: fluxo tem regra de início único (já injetado por FlowStudioV2).
 *   Permitir adicionar mais de um cria fluxo inválido silenciosamente.
 */
export const HIDDEN_KINDS: ReadonlySet<string> = new Set(["start"]);

/**
 * Agrupa as definições do Registry por categoria V3, respeitando a ordem
 * canônica de `V3_LIBRARY_CATEGORIES` e removendo kinds ocultos.
 *
 * Categorias sem blocos registrados (Menu, Randomizador, Conexão de Fluxo)
 * continuam aparecendo — com badge "Em breve".
 */
export interface CategorizedBlocks {
  category: LibraryCategoryV3;
  blocks: BlockDefinition[];
}

export function categorizeBlocks(defs: BlockDefinition[]): CategorizedBlocks[] {
  const buckets = new Map<FlowCategoryV3, BlockDefinition[]>();
  for (const def of defs) {
    if (HIDDEN_KINDS.has(def.kind)) continue;
    const cat = resolveCategoryV3(def.kind, def.meta.category);
    const arr = buckets.get(cat) ?? [];
    arr.push(def);
    buckets.set(cat, arr);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.meta.label.localeCompare(b.meta.label, "pt-BR"));
  }
  return V3_LIBRARY_CATEGORIES.map((category) => ({
    category,
    blocks: buckets.get(category.id) ?? [],
  }));
}
