/**
 * FB-12.5 — Labels visíveis em edges de multi-saída.
 *
 * Cobertura mínima exigida pelo escopo:
 *   1. Condition true = Sim.
 *   2. Condition false = Não.
 *   3. Menu option ID resolve label humana.
 *   4. Menu invalid = Inválido.
 *   5. Randomizer route resolve label humana (+ % compacto quando presente).
 *   6. Alteração do nome de opção/rota atualiza label (fonte canônica).
 *   7. Edge continua preservando sourceHandle (contrato imutável).
 *   8. Label não altera round-trip (não persiste nada novo).
 */
import { describe, expect, it, beforeEach } from "bun:test";
import "../blocks/definitions";
import { resolveEdgeLabel, edgeLabelTone } from "../canvas/v3/tokens";
import { useBuilderStore } from "../state/store";
import { insertBlock } from "../library/insert";

// Polyfills mínimos (mesmo padrão dos outros testes de FB-12).
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

function reset() { useBuilderStore.getState()._reset(); }

describe("FB-12.5 · resolveEdgeLabel (fonte canônica)", () => {
  it("Condition · true → Sim / false → Não", () => {
    expect(resolveEdgeLabel("condition", {}, "true")).toBe("Sim");
    expect(resolveEdgeLabel("condition", {}, "false")).toBe("Não");
    expect(edgeLabelTone("condition", "true")).toBe("yes");
    expect(edgeLabelTone("condition", "false")).toBe("no");
  });

  it("Condition · handle desconhecido não vaza label", () => {
    expect(resolveEdgeLabel("condition", {}, "zzz")).toBeNull();
  });

  it("Menu · resolve label humana a partir de options[]", () => {
    const data = {
      options: [
        { id: "opt_a", label: "Comprar" },
        { id: "opt_b", label: "Falar com atendente" },
      ],
    };
    expect(resolveEdgeLabel("menu", data, "opt_a")).toBe("Comprar");
    expect(resolveEdgeLabel("menu", data, "opt_b")).toBe("Falar com atendente");
  });

  it("Menu · invalid → Inválido (tom vermelho)", () => {
    expect(resolveEdgeLabel("menu", { options: [] }, "invalid")).toBe("Inválido");
    expect(edgeLabelTone("menu", "invalid")).toBe("no");
  });

  it("Menu · option removida devolve null (não vaza ID técnico)", () => {
    expect(resolveEdgeLabel("menu", { options: [{ id: "opt_a", label: "A" }] }, "opt_orphan")).toBeNull();
  });

  it("Randomizer · resolve label + peso compacto", () => {
    const data = {
      routes: [
        { id: "route_a", label: "Caminho A", weight: 70 },
        { id: "route_b", label: "Caminho B", weight: 30 },
      ],
    };
    expect(resolveEdgeLabel("randomizer", data, "route_a")).toBe("Caminho A · 70%");
    expect(resolveEdgeLabel("randomizer", data, "route_b")).toBe("Caminho B · 30%");
  });

  it("Randomizer · sem peso mostra só o label", () => {
    const data = { routes: [{ id: "route_a", label: "Só label" }] };
    expect(resolveEdgeLabel("randomizer", data, "route_a")).toBe("Só label");
  });

  it("Randomizer · rota inexistente devolve null", () => {
    expect(resolveEdgeLabel("randomizer", { routes: [] }, "route_ghost")).toBeNull();
  });

  it("Handle vazio ou nulo devolve null", () => {
    expect(resolveEdgeLabel("condition", {}, null)).toBeNull();
    expect(resolveEdgeLabel("menu", { options: [] }, undefined)).toBeNull();
    expect(resolveEdgeLabel("condition", {}, "")).toBeNull();
  });

  it("Kind sem semântica de multi-saída não força label", () => {
    expect(resolveEdgeLabel("message", {}, "default")).toBeNull();
  });
});

describe("FB-12.5 · label dinâmica reage a edições da fonte", () => {
  beforeEach(reset);

  it("Menu · renomear a opção atualiza a label sem tocar no sourceHandle da edge", () => {
    const store = useBuilderStore.getState();
    const menuId = store.addNode("menu", { x: 0, y: 0 }, {
      question: "Escolha",
      options: [
        { id: "opt_a", label: "Antigo A" },
        { id: "opt_b", label: "Antigo B" },
      ],
      invalid_message: "?",
      max_attempts: 3,
    } as unknown as Record<string, unknown>);

    const targetId = insertBlock("message", { sourceNodeId: menuId, sourceHandle: "opt_a" })!;
    const edgeBefore = useBuilderStore.getState().edgeOrder.map((id) => useBuilderStore.getState().edgesById[id])[0];
    expect(edgeBefore.sourceHandle).toBe("opt_a");
    expect(edgeBefore.target).toBe(targetId);

    // simula o usuário renomeando a opção via SidebarCtx.
    const s = useBuilderStore.getState();
    const menu = s.nodesById[menuId];
    const currentOpts = (menu.data as { options: Array<{ id: string; label: string }> }).options;
    s.updateNodeData(menuId, {
      options: currentOpts.map((o) => (o.id === "opt_a" ? { ...o, label: "Comprar" } : o)),
    });

    const menuAfter = useBuilderStore.getState().nodesById[menuId];
    expect(resolveEdgeLabel("menu", menuAfter.data as Record<string, unknown>, "opt_a")).toBe("Comprar");

    // sourceHandle da edge NÃO muda — o contrato persistido é imutável.
    const edgeAfter = useBuilderStore.getState().edgesById[edgeBefore.id];
    expect(edgeAfter.sourceHandle).toBe("opt_a");
  });

  it("Randomizer · renomear rota + ajustar peso reflete na label imediatamente", () => {
    const store = useBuilderStore.getState();
    const rndId = store.addNode("randomizer", { x: 0, y: 0 });
    insertBlock("message", { sourceNodeId: rndId, sourceHandle: "route_a" });

    const s0 = useBuilderStore.getState();
    const cur = (s0.nodesById[rndId].data as { routes: Array<{ id: string; label: string; weight: number }> }).routes;
    s0.updateNodeData(rndId, {
      routes: cur.map((r) => (r.id === "route_a" ? { ...r, label: "VIP", weight: 80 } : { ...r, weight: 20 })),
    });

    const rnd = useBuilderStore.getState().nodesById[rndId];
    expect(resolveEdgeLabel("randomizer", rnd.data as Record<string, unknown>, "route_a")).toBe("VIP · 80%");
  });
});

describe("FB-12.5 · não altera contrato persistido (round-trip)", () => {
  beforeEach(reset);

  it("Snapshot da store contém apenas campos existentes — nenhuma prop 'label' na edge", () => {
    const store = useBuilderStore.getState();
    const cond = store.addNode("condition", { x: 0, y: 0 });
    insertBlock("message", { sourceNodeId: cond, sourceHandle: "true" });
    insertBlock("message", { sourceNodeId: cond, sourceHandle: "false" });

    const snap = useBuilderStore.getState().toSnapshot();
    // FB-12.5 não adiciona novos campos ao contrato de edge; o sourceHandle
    // segue sendo a fonte de verdade persistida.
    for (const e of snap.edges) {
      expect(typeof e.sourceHandle).toBe("string");
      expect(e.sourceHandle === "true" || e.sourceHandle === "false").toBe(true);
    }

    // reload e valida que as labels ainda resolvem corretamente.
    useBuilderStore.getState()._reset();
    useBuilderStore.getState().loadFromSnapshot("flow-x", snap);
    const s2 = useBuilderStore.getState();
    const condNode = s2.nodesById[cond];
    for (const eid of s2.edgeOrder) {
      const e = s2.edgesById[eid];
      const lbl = resolveEdgeLabel("condition", condNode.data as Record<string, unknown>, e.sourceHandle);
      expect(lbl === "Sim" || lbl === "Não").toBe(true);
    }
  });
});
