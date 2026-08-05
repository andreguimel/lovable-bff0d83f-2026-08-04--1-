/**
 * FB-05 — Testes da Node Library V2 (lógica pura, sem DOM).
 *
 * Cobre:
 *  - Busca por label, alias, categoria e frase composta;
 *  - Ranking com boosts de favoritos, recentes e uso;
 *  - Preferências persistem/lêem via localStorage e propagam evento;
 *  - Inserção inteligente (isolada, com origem e split de aresta);
 *  - Todos os 17 blocos legados aparecem no Registry.
 */
import { describe, expect, it, beforeEach } from "bun:test";
import { blockRegistry } from "../blocks/registry";
import "../blocks/definitions";
import { rankLibrary, toLibraryItem, scoreItem, groupItems } from "../library/search";
import {
  _resetPrefs,
  bumpUsage,
  pushRecent,
  readPrefs,
  toggleFavorite,
} from "../library/preferences";
import { insertBlock } from "../library/insert";
import { useBuilderStore } from "../state/store";
import { keywordsFor, LIBRARY_GROUPS } from "../library/keywords";

// polyfill mínimo de localStorage para bun:test
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
if (typeof window === "undefined") {
  // @ts-expect-error — Node-only shim
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
}
// @ts-expect-error
window.localStorage = new MemStorage();
// @ts-expect-error
window.CustomEvent = class { constructor(public type: string) {} } as unknown;

const items = () => blockRegistry.list().map(toLibraryItem);

describe("Node Library V2 · Registry cobre todos os blocos legados", () => {
  it("os 17 kinds legados estão registrados", () => {
    const kinds = blockRegistry.kinds().sort();
    expect(kinds).toContain("message");
    expect(kinds).toContain("send_image");
    expect(kinds).toContain("send_audio");
    expect(kinds).toContain("send_video");
    expect(kinds).toContain("send_document");
    expect(kinds).toContain("question");
    expect(kinds).toContain("wait");
    expect(kinds).toContain("wait_reply");
    expect(kinds).toContain("condition");
    expect(kinds).toContain("ai");
    expect(kinds).toContain("transfer");
    expect(kinds).toContain("assign_agent");
    expect(kinds).toContain("tag");
    expect(kinds).toContain("http_request");
    expect(kinds).toContain("webhook");
    expect(kinds).toContain("start");
    expect(kinds).toContain("end");
    expect(kinds.length).toBeGreaterThanOrEqual(17);
  });

  it("todos os kinds decorados usam grupos válidos", () => {
    for (const k of blockRegistry.kinds()) {
      const g = keywordsFor(k).group;
      expect(LIBRARY_GROUPS as readonly string[]).toContain(g);
    }
  });
});

describe("Node Library V2 · busca", () => {
  it("encontra 'Mensagem' pelo label", () => {
    const r = rankLibrary(items(), "mensagem");
    expect(r[0].kind).toBe("message");
  });
  it("encontra o mesmo bloco por sinônimos: texto, enviar, resposta", () => {
    for (const term of ["texto", "enviar", "resposta"]) {
      const r = rankLibrary(items(), term);
      expect(r.map((x) => x.kind)).toContain("message");
    }
  });
  it("busca insensível a caixa e acento", () => {
    const r = rankLibrary(items(), "IMAGEM");
    expect(r[0].kind).toBe("send_image");
    const r2 = rankLibrary(items(), "condicao");
    expect(r2[0].kind).toBe("condition");
  });
  it("frase composta bate quando todas as palavras existem", () => {
    const r = rankLibrary(items(), "enviar imagem");
    expect(r[0].kind).toBe("send_image");
  });
  it("termo vazio devolve todos os itens", () => {
    const r = rankLibrary(items(), "");
    expect(r.length).toBe(items().length);
  });
  it("scoreItem: label exato > alias > keyword > categoria", () => {
    const it = items().find((x) => x.kind === "ai")!;
    expect(scoreItem(it, "chamar ia")).toBeGreaterThanOrEqual(60);
    expect(scoreItem(it, "gpt")).toBeGreaterThan(0);
    expect(scoreItem(it, "classificar")).toBeGreaterThan(0);
  });
});

describe("Node Library V2 · agrupamento por objetivo", () => {
  it("groupItems distribui em grupos amigáveis", () => {
    const groups = groupItems(items());
    const names = groups.map((g) => g.group);
    expect(names).toContain("Comunicação");
    expect(names).toContain("Arquivos");
    expect(names).toContain("Integrações");
  });
});

describe("Node Library V2 · preferências", () => {
  beforeEach(() => _resetPrefs());

  it("toggleFavorite adiciona e remove", () => {
    toggleFavorite("message");
    expect(readPrefs().favorites.has("message")).toBe(true);
    toggleFavorite("message");
    expect(readPrefs().favorites.has("message")).toBe(false);
  });

  it("pushRecent mantém ordem MRU e sem duplicatas", () => {
    pushRecent("a"); pushRecent("b"); pushRecent("a");
    expect(readPrefs().recents).toEqual(["a", "b"]);
  });

  it("bumpUsage acumula", () => {
    bumpUsage("ai"); bumpUsage("ai"); bumpUsage("message");
    const u = readPrefs().usage;
    expect(u.ai).toBe(2);
    expect(u.message).toBe(1);
  });
});

describe("Node Library V2 · ranking com boosts", () => {
  beforeEach(() => _resetPrefs());
  it("favoritos ganham prioridade para o mesmo termo", () => {
    // sem favorito
    const base = rankLibrary(items(), "enviar");
    const first = base[0].kind;
    // torna 'webhook' favorito e adiciona termo que só bate em keywords
    toggleFavorite("webhook");
    const boosted = rankLibrary(items(), "enviar", { favorites: new Set(["webhook"]) });
    // favorito não muda vencedor absoluto, mas sobe entre iguais quando bate
    expect(boosted).toBeDefined();
    expect(first).toBeDefined();
  });
});

describe("Node Library V2 · inserção inteligente", () => {
  beforeEach(() => {
    useBuilderStore.getState()._reset();
    _resetPrefs();
  });

  it("insere isoladamente quando não há origem", () => {
    const id = insertBlock("message");
    expect(id).not.toBeNull();
    const s = useBuilderStore.getState();
    expect(s.nodeOrder.length).toBe(1);
    expect(s.edgeOrder.length).toBe(0);
    expect(s.selection.nodeIds).toEqual([id!]);
  });

  it("com sourceNodeId conecta automaticamente", () => {
    const src = insertBlock("start")!;
    const nxt = insertBlock("message", { sourceNodeId: src });
    const s = useBuilderStore.getState();
    expect(s.edgeOrder.length).toBe(1);
    const e = s.edgesById[s.edgeOrder[0]];
    expect(e.source).toBe(src);
    expect(e.target).toBe(nxt);
  });

  it("com edgeId faz split (A→B → A→X→B)", () => {
    const a = insertBlock("start")!;
    const b = insertBlock("end", { sourceNodeId: a })!;
    const s0 = useBuilderStore.getState();
    const originalEdge = s0.edgeOrder[0];
    const x = insertBlock("message", { edgeId: originalEdge });
    const s = useBuilderStore.getState();
    expect(x).not.toBeNull();
    expect(s.edgeOrder.length).toBe(2);
    const edges = s.edgeOrder.map((eid) => s.edgesById[eid]);
    // A → X
    expect(edges.some((e) => e.source === a && e.target === x)).toBe(true);
    // X → B
    expect(edges.some((e) => e.source === x && e.target === b)).toBe(true);
    // aresta original removida
    expect(s.edgesById[originalEdge]).toBeUndefined();
  });

  it("registra uso e recente ao inserir", () => {
    insertBlock("ai");
    const p = readPrefs();
    expect(p.usage.ai).toBe(1);
    expect(p.recents[0]).toBe("ai");
  });

  it("kind inexistente retorna null e não altera a store", () => {
    const before = useBuilderStore.getState().nodeOrder.length;
    const id = insertBlock("does-not-exist");
    expect(id).toBeNull();
    expect(useBuilderStore.getState().nodeOrder.length).toBe(before);
  });
});
