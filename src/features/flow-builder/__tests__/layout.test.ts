/**
 * FB-10.3.2 — Testes do auto-layout hardened.
 *
 * Cobre:
 *   A. determinismo
 *   B. collision zero após layout
 *   C. múltiplos incoming
 *   D. múltiplas branches
 *   E. órfãos
 *   F. múltiplos START
 *   G. grafo complexo estilo "Davilys (cópia)"
 *   H. nextSlotFrom (posicionamento adjacente da FB-10.3.1)
 *   I. performance @ 100 nodes
 *   J. crossing reduction reduz cruzamentos vs baseline
 */
import { describe, expect, it } from "bun:test";
import {
  computeLayeredLayout,
  countCollisions,
  countCrossings,
  nextSlotFrom,
  type LayoutEdgeInput,
  type LayoutNodeInput,
} from "../canvas/layout";

// ---------------------------------------------------------------------
// A · Determinismo
// ---------------------------------------------------------------------
describe("FB-10.3.2 · determinismo", () => {
  it("mesma entrada → mesma saída (bit-a-bit)", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "s", kind: "start" },
      { id: "a", kind: "message" },
      { id: "b", kind: "message" },
      { id: "c", kind: "condition" },
      { id: "d", kind: "message" },
      { id: "e", kind: "end" },
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "s", target: "a" },
      { source: "a", target: "c" },
      { source: "c", target: "b" },
      { source: "c", target: "d" },
      { source: "b", target: "e" },
      { source: "d", target: "e" },
    ];
    const r1 = computeLayeredLayout(nodes, edges);
    const r2 = computeLayeredLayout(nodes, edges);
    for (const id of nodes.map((n) => n.id)) {
      expect(r1.get(id)).toEqual(r2.get(id));
    }
  });
});

// ---------------------------------------------------------------------
// B · Collision zero
// ---------------------------------------------------------------------
describe("FB-10.3.2 · collision pass", () => {
  it("fluxo linear — nenhuma colisão", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "s", kind: "start" },
      { id: "a", kind: "message" },
      { id: "b", kind: "wait" },
      { id: "e", kind: "end" },
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "s", target: "a" },
      { source: "a", target: "b" },
      { source: "b", target: "e" },
    ];
    const r = computeLayeredLayout(nodes, edges);
    expect(countCollisions(r)).toBe(0);
  });

  it("fluxo complexo com múltiplos incoming, branches, órfãos e 2 starts — nenhuma colisão", () => {
    const { nodes, edges } = davilysLikeGraph();
    const r = computeLayeredLayout(nodes, edges);
    expect(countCollisions(r)).toBe(0);
  });
});

// ---------------------------------------------------------------------
// C · Múltiplos incoming
// ---------------------------------------------------------------------
describe("FB-10.3.2 · múltiplos incoming", () => {
  it("nó com 2 parents fica alinhado ao barycentro dos parents (dentro de meia altura de card)", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "s", kind: "start" },
      { id: "a", kind: "message" },
      { id: "b", kind: "message" },
      { id: "j", kind: "message" }, // recebe de a e b
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "s", target: "a" },
      { source: "s", target: "b" },
      { source: "a", target: "j" },
      { source: "b", target: "j" },
    ];
    const r = computeLayeredLayout(nodes, edges);
    const bary = (r.get("a")!.y + r.get("b")!.y) / 2;
    // tolerância = altura de um card (algoritmo garante gap, mas não
    // barycenter exato quando há empurrão vertical).
    expect(Math.abs(r.get("j")!.y - bary)).toBeLessThanOrEqual(200);
    expect(countCollisions(r)).toBe(0);
  });
});

// ---------------------------------------------------------------------
// D · Branches (condition → Sim/Não)
// ---------------------------------------------------------------------
describe("FB-10.3.2 · branches", () => {
  it("condition com Sim/Não distribui verticalmente e não sobrepõe", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "s", kind: "start" },
      { id: "c", kind: "condition" },
      { id: "sim", kind: "message" },
      { id: "nao", kind: "message" },
      { id: "e", kind: "end" },
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "s", target: "c" },
      { source: "c", target: "sim" },
      { source: "c", target: "nao" },
      { source: "sim", target: "e" },
      { source: "nao", target: "e" },
    ];
    const r = computeLayeredLayout(nodes, edges);
    expect(r.get("sim")!.x).toBe(r.get("nao")!.x);
    expect(Math.abs(r.get("sim")!.y - r.get("nao")!.y)).toBeGreaterThanOrEqual(
      200,
    );
    expect(countCollisions(r)).toBe(0);
  });
});

// ---------------------------------------------------------------------
// E · Órfãos
// ---------------------------------------------------------------------
describe("FB-10.3.2 · órfãos", () => {
  it("nós órfãos puros vão para zona ABAIXO do fluxo principal, sem colidir", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "s", kind: "start" },
      { id: "a", kind: "message" },
      { id: "b", kind: "message" },
      { id: "orph1", kind: "message" },
      { id: "orph2", kind: "message" },
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "s", target: "a" },
      { source: "a", target: "b" },
    ];
    const r = computeLayeredLayout(nodes, edges);
    const mainMaxY = Math.max(r.get("s")!.y, r.get("a")!.y, r.get("b")!.y);
    expect(r.get("orph1")!.y).toBeGreaterThan(mainMaxY);
    expect(r.get("orph2")!.y).toBeGreaterThan(mainMaxY);
    expect(countCollisions(r)).toBe(0);
  });
});

// ---------------------------------------------------------------------
// F · Múltiplos START
// ---------------------------------------------------------------------
describe("FB-10.3.2 · múltiplos START", () => {
  it("start com mais alcance vira principal; o outro cai na zona de problemas", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "s_main", kind: "start" },
      { id: "s_extra", kind: "start" },
      { id: "a", kind: "message" },
      { id: "b", kind: "message" },
    ];
    const edges: LayoutEdgeInput[] = [
      { source: "s_main", target: "a" },
      { source: "a", target: "b" },
    ];
    const r = computeLayeredLayout(nodes, edges);
    // start extra fica abaixo do maior Y do fluxo principal
    const mainMaxY = Math.max(
      r.get("s_main")!.y,
      r.get("a")!.y,
      r.get("b")!.y,
    );
    expect(r.get("s_extra")!.y).toBeGreaterThan(mainMaxY);
    // não colide
    expect(countCollisions(r)).toBe(0);
  });

  it("desempate por ordem original quando ambos os starts alcançam o mesmo tanto", () => {
    const nodes: LayoutNodeInput[] = [
      { id: "s_first", kind: "start" },
      { id: "s_second", kind: "start" },
    ];
    const edges: LayoutEdgeInput[] = [];
    const r = computeLayeredLayout(nodes, edges);
    // s_first fica no fluxo principal (originY); s_second desce
    expect(r.get("s_first")!.y).toBeLessThan(r.get("s_second")!.y);
  });
});

// ---------------------------------------------------------------------
// G · Grafo estilo "Davilys (cópia)"
// ---------------------------------------------------------------------
describe("FB-10.3.2 · grafo complexo (Davilys)", () => {
  it("14 nós + 10 edges + 2 starts + 2 órfãos → zero colisão", () => {
    const { nodes, edges } = davilysLikeGraph();
    const r = computeLayeredLayout(nodes, edges);
    expect(r.size).toBe(nodes.length);
    expect(countCollisions(r)).toBe(0);
  });

  it("crossing reduction é <= baseline sem sweeps", () => {
    const { nodes, edges } = davilysLikeGraph();
    const baseline = computeLayeredLayout(nodes, edges, {
      crossingSweeps: 0,
    });
    const optimized = computeLayeredLayout(nodes, edges, {
      crossingSweeps: 12,
    });
    const baseCross = countCrossings(nodes, edges, baseline);
    const optCross = countCrossings(nodes, edges, optimized);
    expect(optCross).toBeLessThanOrEqual(baseCross);
  });
});

// ---------------------------------------------------------------------
// H · nextSlotFrom (herdado da FB-10.3.1)
// ---------------------------------------------------------------------
describe("FB-10.3.2 · nextSlotFrom", () => {
  it("primeiro filho: à direita, mesma linha", () => {
    const nodesById = { s: { position: { x: 100, y: 200 } } };
    const pos = nextSlotFrom("s", nodesById, []);
    expect(pos.x).toBeGreaterThan(100 + 300);
    expect(pos.y).toBe(200);
  });

  it("filho subsequente: empilha abaixo", () => {
    const nodesById = {
      s: { position: { x: 0, y: 0 } },
      a: { position: { x: 460, y: 0 } },
    };
    const pos = nextSlotFrom("s", nodesById, ["a"]);
    expect(pos.x).toBe(460);
    expect(pos.y).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// I · Performance @ 100 nós
// ---------------------------------------------------------------------
describe("FB-10.3.2 · performance", () => {
  it("100 nós lineares — abaixo de 100ms", () => {
    const nodes: LayoutNodeInput[] = [{ id: "n0", kind: "start" }];
    const edges: LayoutEdgeInput[] = [];
    for (let i = 1; i < 100; i++) {
      nodes.push({ id: `n${i}`, kind: "message" });
      edges.push({ source: `n${i - 1}`, target: `n${i}` });
    }
    const t0 = performance.now();
    const r = computeLayeredLayout(nodes, edges);
    const dt = performance.now() - t0;
    expect(r.size).toBe(100);
    expect(dt).toBeLessThan(100);
    expect(countCollisions(r)).toBe(0);
  });

  it("100 nós em árvore ternária — abaixo de 200ms", () => {
    const nodes: LayoutNodeInput[] = [{ id: "n0", kind: "start" }];
    const edges: LayoutEdgeInput[] = [];
    for (let i = 1; i < 100; i++) {
      nodes.push({ id: `n${i}`, kind: "message" });
      edges.push({ source: `n${Math.floor((i - 1) / 3)}`, target: `n${i}` });
    }
    const t0 = performance.now();
    const r = computeLayeredLayout(nodes, edges);
    const dt = performance.now() - t0;
    expect(r.size).toBe(100);
    expect(dt).toBeLessThan(200);
    expect(countCollisions(r)).toBe(0);
  });
});

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------
function davilysLikeGraph(): {
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
} {
  // 14 nós, 10 edges, 2 starts, 2 órfãos, alguns nós reconvergentes.
  const nodes: LayoutNodeInput[] = [
    { id: "s1", kind: "start" }, // principal
    { id: "msg1", kind: "send_text" },
    { id: "wait1", kind: "wait" },
    { id: "aud1", kind: "send_audio" },
    { id: "msg2", kind: "send_text" },
    { id: "wait2", kind: "wait" },
    { id: "aud2", kind: "send_audio" },
    { id: "ask", kind: "ask" },
    { id: "ai", kind: "call_ai" },
    { id: "end1", kind: "end" },
    { id: "s2", kind: "start" }, // extra → problema
    { id: "vid_orph", kind: "send_video" }, // órfão
    { id: "file_orph", kind: "send_document" }, // órfão
    { id: "note", kind: "message" }, // órfão adicional
  ];
  const edges: LayoutEdgeInput[] = [
    { source: "s1", target: "msg1" },
    { source: "msg1", target: "wait1" },
    { source: "wait1", target: "aud1" },
    { source: "aud1", target: "msg2" },
    { source: "msg2", target: "wait2" },
    { source: "wait2", target: "aud2" },
    { source: "aud2", target: "ask" },
    { source: "ask", target: "ai" },
    { source: "ai", target: "end1" },
    { source: "msg1", target: "ai" }, // reconvergência
  ];
  return { nodes, edges };
}
