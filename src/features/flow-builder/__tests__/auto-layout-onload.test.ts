/**
 * FB-12.2 · Auto-layout ao abrir — heurística `needsAutoLayout` + integração
 * com `computeLayeredLayout`.
 */
import { describe, expect, it } from "bun:test";
import {
  computeLayeredLayout,
  needsAutoLayout,
  countCollisions,
} from "../canvas/layout";

const at = (x: number, y: number) => ({ position: { x, y } });

describe("FB-12.2 · needsAutoLayout", () => {
  it("false para grafo com < 2 nós", () => {
    expect(needsAutoLayout([])).toBe(false);
    expect(needsAutoLayout([at(0, 0)])).toBe(false);
    expect(needsAutoLayout([at(120, 340)])).toBe(false);
  });

  it("true quando todos os nós estão em (0,0) — fluxo importado sem posições", () => {
    expect(needsAutoLayout([at(0, 0), at(0, 0), at(0, 0)])).toBe(true);
  });

  it("true quando todos os nós compartilham exatamente a mesma coordenada", () => {
    expect(needsAutoLayout([at(120, 200), at(120, 200), at(120, 200)])).toBe(true);
  });

  it("true quando há colisões reais (cards com bounding boxes sobrepostos) — fluxos legados salvos com posições ruins", () => {
    // Dois nós no mesmo ponto + um separado: os dois primeiros colidem, precisa reorganizar.
    expect(needsAutoLayout([at(0, 0), at(0, 0), at(400, 120)])).toBe(true);
    // Cards a 140px de distância vertical (menor que a altura padrão do card) → sobrepõem.
    expect(needsAutoLayout([at(120, 200), at(120, 340)])).toBe(true);
  });

  it("false para grafo já disperso", () => {
    expect(
      needsAutoLayout([at(0, 0), at(300, 0), at(600, 120), at(900, -80)]),
    ).toBe(false);
  });
});

describe("FB-12.2 · integração load → auto-layout", () => {
  it("aplica layout válido para START → MESSAGE → END quando entra sem posições", () => {
    const nodes = [
      { id: "s", kind: "start", position: { x: 0, y: 0 } },
      { id: "m", kind: "message", position: { x: 0, y: 0 } },
      { id: "e", kind: "end", position: { x: 0, y: 0 } },
    ];
    const edges = [
      { source: "s", target: "m" },
      { source: "m", target: "e" },
    ];
    expect(needsAutoLayout(nodes)).toBe(true);
    const positions = computeLayeredLayout(
      nodes.map((n) => ({ id: n.id, kind: n.kind })),
      edges,
    );
    // 3 nós posicionados, 0 colisões, x crescendo em cada layer.
    expect(positions.size).toBe(3);
    expect(countCollisions(positions)).toBe(0);
    const xs = ["s", "m", "e"].map((id) => positions.get(id)!.x);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it("layout determinístico: mesmo grafo → mesmas posições", () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      kind: i === 0 ? "start" : i === 7 ? "end" : "message",
    }));
    const edges = Array.from({ length: 7 }, (_, i) => ({
      source: `n${i}`,
      target: `n${i + 1}`,
    }));
    const a = computeLayeredLayout(nodes, edges);
    const b = computeLayeredLayout(nodes, edges);
    for (const [id, p] of a) {
      expect(b.get(id)).toEqual(p);
    }
  });
});
