/**
 * FB-10.4D — Round-trip, Health e Registry do bloco Randomizador.
 */
import { describe, expect, it } from "bun:test";
import { blockRegistry } from "../blocks/registry";
import { ensureLegacyBlocksRegistered } from "../blocks/definitions";
import { roundTrip } from "../io/serializer";

ensureLegacyBlocksRegistered();

describe("FB-10.4D · Bloco Randomizador · Registry + Round-trip + Health", () => {
  it("Registry expõe `randomizer` com defaults consistentes (50/50)", () => {
    const def = blockRegistry.get("randomizer");
    expect(def).toBeDefined();
    expect(def!.meta.category).toBe("logic");
    const routes = (def!.meta.defaults as { routes: Array<{ id: string; weight: number }> }).routes;
    expect(routes).toHaveLength(2);
    expect(routes[0].weight + routes[1].weight).toBe(100);
    expect(new Set(routes.map((r) => r.id)).size).toBe(2);
  });

  it("Health bloqueia soma ≠ 100, rotas insuficientes e IDs duplicados", () => {
    const insufficient = blockRegistry.validate("randomizer", {
      routes: [{ id: "a", label: "A", weight: 100 }],
    });
    expect(insufficient.valid).toBe(false);

    const badSum = blockRegistry.validate("randomizer", {
      routes: [
        { id: "a", label: "A", weight: 60 },
        { id: "b", label: "B", weight: 30 },
      ],
    });
    expect(badSum.valid).toBe(false);
    expect(badSum.issues[0].message).toContain("100%");

    const dup = blockRegistry.validate("randomizer", {
      routes: [
        { id: "a", label: "A", weight: 50 },
        { id: "a", label: "A2", weight: 50 },
      ],
    });
    expect(dup.valid).toBe(false);

    const negative = blockRegistry.validate("randomizer", {
      routes: [
        { id: "a", label: "A", weight: -10 },
        { id: "b", label: "B", weight: 110 },
      ],
    });
    expect(negative.valid).toBe(false);

    const ok = blockRegistry.validate("randomizer", {
      routes: [
        { id: "a", label: "A", weight: 70 },
        { id: "b", label: "B", weight: 30 },
      ],
    });
    expect(ok.valid).toBe(true);
  });

  it("preview humano (percentuais e nomes, sem UUID)", () => {
    const def = blockRegistry.require("randomizer");
    const p = def.preview!({
      routes: [
        { id: "route_x", label: "Vendas", weight: 70 },
        { id: "route_y", label: "Suporte", weight: 30 },
      ],
    } as never);
    expect(p).toContain("70%");
    expect(p).toContain("Vendas");
    expect(p).not.toContain("route_");
  });

  it("getHandles gera saída independente por rota com ID estável", () => {
    const def = blockRegistry.require("randomizer");
    const routes = [
      { id: "route_x", label: "Vendas", weight: 70 },
      { id: "route_y", label: "Suporte", weight: 30 },
      { id: "route_z", label: "VIP", weight: 0 },
    ];
    const h = def.getHandles!({ routes } as never);
    expect(h.in).toBe(1);
    expect(h.out.map((o) => o.id)).toEqual(["route_x", "route_y", "route_z"]);
    expect(h.out[0].label).toContain("Vendas");
  });

  it("round-trip preserva IDs, labels e pesos das rotas", () => {
    const graph = {
      nodes: [
        { id: "n1", node_type: "start", position: { x: 0, y: 0 }, data: {} },
        {
          id: "n2",
          node_type: "randomizer",
          position: { x: 260, y: 0 },
          data: {
            label: "Divisão",
            mode: "weighted",
            routes: [
              { id: "route_x", label: "Vendas", weight: 70 },
              { id: "route_y", label: "Suporte", weight: 30 },
            ],
          },
        },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", sourceHandle: "default" },
      ],
    };
    const rt = roundTrip(graph as never);
    const n2 = rt.nodes.find((n) => n.id === "n2")!;
    const routes = (n2.data as { routes: Array<{ id: string; label: string; weight: number }> }).routes;
    expect(routes).toEqual([
      { id: "route_x", label: "Vendas", weight: 70 },
      { id: "route_y", label: "Suporte", weight: 30 },
    ]);
  });

  it("IDs estáveis: renomear label ou alterar peso não muda id (contrato)", () => {
    const original = [
      { id: "route_x", label: "Vendas", weight: 70 },
      { id: "route_y", label: "Suporte", weight: 30 },
    ];
    // simular edição pelo operador — id imutável
    const edited = original.map((r) =>
      r.id === "route_x"
        ? { ...r, label: "Comercial", weight: 60 }
        : { ...r, weight: 40 },
    );
    expect(edited.map((r) => r.id)).toEqual(["route_x", "route_y"]);
    const v = blockRegistry.validate("randomizer", { routes: edited });
    expect(v.valid).toBe(true);
  });
});
