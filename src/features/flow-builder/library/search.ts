/**
 * FB-05 — Busca pura para a Node Library V2.
 *
 * Sem estado, sem React. Recebe o Registry decorado e um termo de busca
 * e devolve os itens ordenados por relevância. Fica em módulo próprio
 * para permitir testes fora do DOM e reuso pelo Command Palette e pelo
 * sidebar.
 */
import type { BlockDefinition } from "../blocks/types";
import { keywordsFor, type LibraryGroup } from "./keywords";

export interface LibraryItem {
  kind: string;
  def: BlockDefinition;
  group: LibraryGroup;
  aliases: string[];
  keywords: string[];
  examples: string[];
}

export function toLibraryItem(def: BlockDefinition): LibraryItem {
  const kw = keywordsFor(def.kind);
  return {
    kind: def.kind,
    def,
    group: kw.group,
    aliases: kw.aliases,
    keywords: kw.keywords,
    examples: kw.examples,
  };
}

/** Normaliza para busca insensível a acento/caixa. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Pontuação por casamento. Quanto maior, mais relevante.
 * Retorna 0 quando não bate em nada — o item é excluído.
 */
export function scoreItem(item: LibraryItem, termRaw: string): number {
  const term = norm(termRaw);
  if (!term) return 1;
  const label = norm(item.def.meta.label);
  const short = norm(item.def.meta.short);
  const group = norm(item.group);
  const cat = norm(item.def.meta.category);
  const aliases = item.aliases.map(norm);
  const keys = item.keywords.map(norm);

  // exato / prefixo em label vale mais
  if (label === term) return 100;
  if (label.startsWith(term)) return 80;
  if (label.includes(term)) return 60;

  if (aliases.some((a) => a === term)) return 55;
  if (aliases.some((a) => a.startsWith(term))) return 45;
  if (aliases.some((a) => a.includes(term))) return 35;

  if (short.includes(term)) return 25;
  if (keys.some((k) => k.includes(term))) return 20;
  if (group.includes(term)) return 15;
  if (cat.includes(term)) return 10;

  // tolerância mínima — trata cada palavra do termo separadamente
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const haystack = [label, short, group, cat, ...aliases, ...keys].join(" ");
    if (words.every((w) => haystack.includes(w))) return 8;
  }

  return 0;
}

export interface RankOptions {
  favorites?: Set<string>;
  recents?: string[];
  usage?: Record<string, number>;
}

/**
 * Ordena todos os itens por relevância + boosts.
 * - Favoritos ganham +5
 * - Recentes ganham até +4 conforme frescor
 * - Uso ganha até +3 conforme frequência (log)
 */
export function rankLibrary(
  items: LibraryItem[],
  term: string,
  opts: RankOptions = {},
): LibraryItem[] {
  const favs = opts.favorites ?? new Set<string>();
  const recents = opts.recents ?? [];
  const usage = opts.usage ?? {};

  const scored = items
    .map((it) => {
      const base = scoreItem(it, term);
      if (base === 0) return { it, score: 0 };
      let boost = 0;
      if (favs.has(it.kind)) boost += 5;
      const rIdx = recents.indexOf(it.kind);
      if (rIdx >= 0) boost += Math.max(0, 4 - rIdx * 0.5);
      const u = usage[it.kind] ?? 0;
      if (u > 0) boost += Math.min(3, Math.log2(1 + u));
      return { it, score: base + boost };
    })
    .filter((x) => x.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.it.def.meta.label.localeCompare(b.it.def.meta.label, "pt-BR");
  });
  return scored.map((x) => x.it);
}

/** Agrupa itens por `group`, preservando a ordem de `LIBRARY_GROUPS`. */
export function groupItems(
  items: LibraryItem[],
): Array<{ group: LibraryGroup; items: LibraryItem[] }> {
  const map = new Map<LibraryGroup, LibraryItem[]>();
  for (const it of items) {
    const arr = map.get(it.group) ?? [];
    arr.push(it);
    map.set(it.group, arr);
  }
  // ordem determinística por label dentro de cada grupo
  const groups = [...map.entries()].map(([group, list]) => ({
    group,
    items: list.sort((a, b) =>
      a.def.meta.label.localeCompare(b.def.meta.label, "pt-BR"),
    ),
  }));
  return groups.sort((a, b) => a.group.localeCompare(b.group, "pt-BR"));
}
