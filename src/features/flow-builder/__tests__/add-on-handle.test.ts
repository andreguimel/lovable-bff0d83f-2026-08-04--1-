/**
 * FB-12.4 — Add-on-handle + Mini-palette contextual.
 *
 * Cobre o contrato observável do add-on:
 *   1. `insertBlock` preserva sourceHandle em multi-outputs (Condition / Menu / Randomizer).
 *   2. A lista disponível na mini-palette é derivada do Registry (fonte canônica)
 *      e nunca vaza kinds ocultos (`HIDDEN_KINDS`).
 *   3. Round-trip: nó criado via add-on + edge com sourceHandle são preservados
 *      no snapshot da store.
 */
import { describe, expect, it, beforeEach } from "bun:test";
import "../blocks/definitions";
import { blockRegistry } from "../blocks/registry";
import { insertBlock } from "../library/insert";
import { useBuilderStore } from "../state/store";
import { HIDDEN_KINDS } from "../library/v3/categories";
import { resolveCategoryV3 } from "../canvas/v3/tokens";

// Polyfills mínimos para bun:test (mesmo padrão de library.test.ts).
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
if (typeof window === "undefined") {
  // @ts-expect-error — shim only for tests
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
}
// @ts-expect-error
window.localStorage = new MemStorage();
// @ts-expect-error
window.CustomEvent = class { constructor(public type: string) {} } as unknown;

function reset() {
  useBuilderStore.getState()._reset();
}

describe("FB-12.4 · Add-on-handle wiring", () => {
  beforeEach(reset);

  it("insertBlock preserva sourceHandle em Condition (true)", () => {
    const store = useBuilderStore.getState();
    const cond = store.addNode("condition", { x: 0, y: 0 });

    const newId = insertBlock("message", {
      sourceNodeId: cond,
      sourceHandle: "true",
    });
    expect(newId).not.toBeNull();

    const s = useBuilderStore.getState();
    const edges = s.edgeOrder.map((id) => s.edgesById[id]);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe(cond);
    expect(edges[0].target).toBe(newId);
    expect(edges[0].sourceHandle).toBe("true");
  });

  it("insertBlock preserva sourceHandle em Condition (false)", () => {
    const store = useBuilderStore.getState();
    const cond = store.addNode("condition", { x: 0, y: 0 });
    const newId = insertBlock("message", { sourceNodeId: cond, sourceHandle: "false" });
    const e = useBuilderStore.getState();
    const edge = e.edgeOrder.map((id) => e.edgesById[id])[0];
    expect(edge.sourceHandle).toBe("false");
    expect(edge.target).toBe(newId);
  });

  it("insertBlock preserva sourceHandle em saída específica de Menu", () => {
    const store = useBuilderStore.getState();
    // simula um Menu já com opções (option IDs estáveis vindos do add do usuário).
    const menu = store.addNode("menu", { x: 0, y: 0 }, {
      question: "Escolha",
      options: [
        { id: "opt_a", label: "A" },
        { id: "opt_b", label: "B" },
      ],
      invalid_message: "?",
      max_attempts: 3,
    } as unknown as Record<string, unknown>);

    insertBlock("message", { sourceNodeId: menu, sourceHandle: "opt_b" });
    insertBlock("message", { sourceNodeId: menu, sourceHandle: "invalid" });

    const s = useBuilderStore.getState();
    const edges = s.edgeOrder.map((id) => s.edgesById[id]);
    expect(edges).toHaveLength(2);
    const handles = edges.map((e) => e.sourceHandle).sort();
    expect(handles).toEqual(["invalid", "opt_b"]);
  });

  it("insertBlock preserva sourceHandle em rota do Randomizador", () => {
    const store = useBuilderStore.getState();
    const rnd = store.addNode("randomizer", { x: 0, y: 0 });
    insertBlock("message", { sourceNodeId: rnd, sourceHandle: "route_1" });
    const s = useBuilderStore.getState();
    const edge = s.edgeOrder.map((id) => s.edgesById[id])[0];
    expect(edge.sourceHandle).toBe("route_1");
  });

  it("edge criada via add-on sobrevive ao round-trip da store", () => {
    const store = useBuilderStore.getState();
    const src = store.addNode("condition", { x: 0, y: 0 });
    const dst = insertBlock("message", { sourceNodeId: src, sourceHandle: "true" })!;
    const snap = useBuilderStore.getState().toSnapshot();
    // recarrega em outra "sessão"
    useBuilderStore.getState()._reset();
    useBuilderStore.getState().loadFromSnapshot("flow-x", snap);
    const s = useBuilderStore.getState();
    const edge = s.edgeOrder.map((id) => s.edgesById[id])[0];
    expect(edge.source).toBe(src);
    expect(edge.target).toBe(dst);
    expect(edge.sourceHandle).toBe("true");
  });

  it("inserir novamente na mesma saída encaixa o novo bloco no caminho sem duplicar a saída", () => {
    const store = useBuilderStore.getState();
    const src = store.addNode("message", { x: 0, y: 0 });
    const first = insertBlock("message", { sourceNodeId: src, sourceHandle: "default" })!;
    const second = insertBlock("message", { sourceNodeId: src, sourceHandle: "default" })!;

    const s = useBuilderStore.getState();
    const edges = s.edgeOrder.map((id) => s.edgesById[id]);
    const fromSrc = edges.filter((e) => e.source === src && (e.sourceHandle ?? "default") === "default");
    expect(fromSrc).toHaveLength(1);
    expect(fromSrc[0].target).toBe(second);
    expect(edges.find((e) => e.source === second && e.target === first)).toBeDefined();
  });

  it("conexão manual substitui conexão anterior da mesma saída", () => {
    const store = useBuilderStore.getState();
    const src = store.addNode("message", { x: 0, y: 0 });
    const a = store.addNode("message", { x: 420, y: 0 });
    const b = store.addNode("message", { x: 420, y: 220 });

    store.connect({ source: src, target: a, sourceHandle: "default", label: null });
    store.connect({ source: src, target: b, sourceHandle: null, label: null });

    const s = useBuilderStore.getState();
    const fromSrc = s.edgeOrder.map((id) => s.edgesById[id]).filter((e) => e.source === src);
    expect(fromSrc).toHaveLength(1);
    expect(fromSrc[0].target).toBe(b);
  });

  it("inserir bloco terminal no meio encerra o caminho sem criar saída impossível", () => {
    const store = useBuilderStore.getState();
    const src = store.addNode("message", { x: 0, y: 0 });
    const target = insertBlock("message", { sourceNodeId: src, sourceHandle: "default" })!;
    const end = insertBlock("end", { sourceNodeId: src, sourceHandle: "default" })!;

    const s = useBuilderStore.getState();
    const edges = s.edgeOrder.map((id) => s.edgesById[id]);
    expect(edges.find((e) => e.source === src && e.target === end)).toBeDefined();
    expect(edges.find((e) => e.source === end && e.target === target)).toBeUndefined();
  });

  it("undo desfaz a inserção feita via add-on sem estourar o histórico", () => {
    const store = useBuilderStore.getState();
    const src = store.addNode("condition", { x: 0, y: 0 });
    insertBlock("message", { sourceNodeId: src, sourceHandle: "true" });
    expect(useBuilderStore.getState().edgeOrder.length).toBe(1);
    // desfaz até o histórico esgotar; nunca deve lançar.
    for (let i = 0; i < 10; i++) useBuilderStore.getState().undo();
    const s = useBuilderStore.getState();
    expect(s.edgeOrder).toEqual([]);
    expect(s.nodeOrder.length).toBeLessThanOrEqual(1);
    // redo restaura pelo menos parte do que foi desfeito.
    for (let i = 0; i < 10; i++) useBuilderStore.getState().redo();
    const s2 = useBuilderStore.getState();
    expect(s2.nodeOrder.length).toBeGreaterThan(0);
  });
});

describe("FB-12.4 · Mini-palette (fonte canônica)", () => {
  it("lista todos os blocos do Registry exceto os ocultos", () => {
    const all = blockRegistry.list().filter((d) => !HIDDEN_KINDS.has(d.kind));
    // start é oculto
    expect(all.find((d) => d.kind === "start")).toBeUndefined();
    // pelo menos os kinds das missões FB-10.4 estão presentes
    const kinds = all.map((d) => d.kind);
    for (const k of ["message", "condition", "menu", "randomizer", "action", "flow_connection"]) {
      expect(kinds).toContain(k);
    }
  });

  it("todo bloco listado tem categoria V3 resolvível", () => {
    const all = blockRegistry.list().filter((d) => !HIDDEN_KINDS.has(d.kind));
    for (const def of all) {
      const cat = resolveCategoryV3(def.kind, def.meta.category);
      expect(typeof cat).toBe("string");
      expect(cat.length).toBeGreaterThan(0);
    }
  });
});
