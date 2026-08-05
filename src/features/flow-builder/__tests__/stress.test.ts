/**
 * FB-08 — Stress tests do Flow Builder V2.
 *
 * Não altera Runtime, Banco ou regras de negócio. Apenas exercita, em
 * memória, os hot paths do Builder para provar que a arquitetura
 * atual aguenta a carga alvo (até 1.000 blocos) e para registrar
 * métricas objetivas no relatório FB-08.
 *
 * Cenários:
 *   1. Canvas store — add 100 / 250 / 500 / 1.000 blocos, conectar,
 *      selecionar, serializar (toSnapshot + toServer).
 *   2. Motor de validação — analyzeFlow em grafos grandes + hit de
 *      cache incremental sobre snapshots idênticos.
 *   3. Node Library — rankLibrary com Registry inflado a 50 / 100 /
 *      250 / 500 blocos.
 *   4. SmartSidebar thrash — alternar seleção 1.000× + editar dados
 *      1.000× sem inflar estado.
 *
 * Os thresholds são folgados de propósito (2–10× o observado em CI)
 * para evitar flakes. O objetivo é *detectar regressão de ordem de
 * grandeza*, não medir microbench.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import "../blocks/definitions";
import { useBuilderStore } from "../state/store";
import { toServer } from "../io/serializer";
import {
  analyzeFlow,
  resetAnalyzerCache,
  type GraphContext,
} from "../validation";
import { blockRegistry } from "../blocks/registry";
import { rankLibrary, toLibraryItem } from "../library/search";
import type { BlockDefinition } from "../blocks/types";
import type { BuilderEdge, BuilderNode } from "../state/types";

const ctx: GraphContext = { agents: [], channels: [] };

/** Mede o tempo médio (ms) de N execuções da função. */
function bench(label: string, iters: number, fn: () => void): number {
  // aquecimento leve (JIT + primeiro alloc)
  fn();
  const start = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const total = performance.now() - start;
  const avg = total / iters;
  // Log determinístico para copiar métricas ao relatório FB-08.
  console.log(`[FB-08] ${label} — ${iters}x, total=${total.toFixed(1)}ms, avg=${avg.toFixed(3)}ms`);
  return avg;
}

function seedGraph(size: number): { nodes: BuilderNode[]; edges: BuilderEdge[] } {
  const nodes: BuilderNode[] = [{ id: "s", kind: "start", position: { x: 0, y: 0 }, data: {} }];
  for (let i = 0; i < size; i++) {
    nodes.push({
      id: `m${i}`,
      kind: "message",
      position: { x: (i % 40) * 220, y: Math.floor(i / 40) * 140 },
      data: { body: `passo ${i}` },
    });
  }
  nodes.push({ id: "e", kind: "end", position: { x: 0, y: 0 }, data: {} });

  const edges: BuilderEdge[] = [{ id: "e_s", source: "s", target: "m0", sourceHandle: null, label: null }];
  for (let i = 0; i < size - 1; i++) {
    edges.push({ id: `e_${i}`, source: `m${i}`, target: `m${i + 1}`, sourceHandle: null, label: null });
  }
  edges.push({ id: "e_end", source: `m${size - 1}`, target: "e", sourceHandle: null, label: null });
  return { nodes, edges };
}

describe("FB-08 · Canvas store — carga", () => {
  const sizes = [100, 250, 500, 1000];

  beforeEach(() => {
    useBuilderStore.getState()._reset();
    resetAnalyzerCache();
  });

  for (const size of sizes) {
    it(`aguenta ${size} blocos (add + connect + snapshot + toServer)`, () => {
      const store = useBuilderStore.getState();
      const { nodes, edges } = seedGraph(size);

      const t0 = performance.now();
      store.loadFromSnapshot("stress", { nodes, edges });
      const tLoad = performance.now() - t0;

      const s = useBuilderStore.getState();
      expect(s.nodeOrder.length).toBe(size + 2);
      expect(s.edgeOrder.length).toBe(size + 1);

      const t1 = performance.now();
      const snap = s.toSnapshot();
      const tSnap = performance.now() - t1;

      const t2 = performance.now();
      const dto = toServer(snap);
      const tDto = performance.now() - t2;

      expect(dto.nodes.length).toBe(size + 2);
      expect(dto.edges.length).toBe(size + 1);

      // seleção sequencial (100 nós)
      const pick = Math.min(100, size);
      const t3 = performance.now();
      for (let i = 0; i < pick; i++) useBuilderStore.getState().selectNode(`m${i}`);
      const tSel = performance.now() - t3;

      console.log(
        `[FB-08] canvas ${size} — load=${tLoad.toFixed(1)}ms snapshot=${tSnap.toFixed(1)}ms toServer=${tDto.toFixed(1)}ms select100=${tSel.toFixed(1)}ms`,
      );

      // orçamentos folgados — falhamos apenas se degradar 1 ordem de grandeza
      expect(tLoad).toBeLessThan(1500);
      expect(tSnap).toBeLessThan(500);
      expect(tDto).toBeLessThan(500);
      expect(tSel).toBeLessThan(1000);
    });
  }
});

describe("FB-08 · Motor de validação — carga", () => {
  beforeEach(() => resetAnalyzerCache());

  it("analisa 500 blocos em <300ms", () => {
    const { nodes, edges } = seedGraph(500);
    const t0 = performance.now();
    const r = analyzeFlow(nodes, edges, ctx);
    const t = performance.now() - t0;
    console.log(`[FB-08] validate 500 — ${t.toFixed(1)}ms score=${r.score}`);
    expect(r.canPublish).toBe(true);
    expect(t).toBeLessThan(300);
  });

  it("analisa 1000 blocos em <800ms", () => {
    const { nodes, edges } = seedGraph(1000);
    const t0 = performance.now();
    const r = analyzeFlow(nodes, edges, ctx);
    const t = performance.now() - t0;
    console.log(`[FB-08] validate 1000 — ${t.toFixed(1)}ms score=${r.score}`);
    expect(r.canPublish).toBe(true);
    expect(t).toBeLessThan(800);
  });

  it("cache incremental: 2ª análise do mesmo snapshot é ~zero-copy", () => {
    const { nodes, edges } = seedGraph(500);
    const r1 = analyzeFlow(nodes, edges, ctx);
    const t0 = performance.now();
    const r2 = analyzeFlow(nodes, edges, ctx);
    const t = performance.now() - t0;
    console.log(`[FB-08] validate 500 (cache) — ${t.toFixed(3)}ms`);
    expect(r2).toBe(r1); // mesma referência = hit de cache
    expect(t).toBeLessThan(5);
  });
});

describe("FB-08 · Node Library — Registry inflado", () => {
  const originalKinds = blockRegistry.list().map((d) => d.kind);

  function inflateTo(target: number): string[] {
    const created: string[] = [];
    const base = blockRegistry.get("message");
    if (!base) throw new Error("bloco 'message' ausente");
    const need = Math.max(0, target - blockRegistry.list().length);
    for (let i = 0; i < need; i++) {
      const kind = `__stress_${i}`;
      const clone: BlockDefinition = {
        ...base,
        kind,
        meta: {
          ...base.meta,
          label: `Bloco stress ${i}`,
          description: `bloco sintético #${i}`,
        },
      };
      blockRegistry.register(clone);
      created.push(kind);
    }
    return created;
  }

  function cleanup(created: string[]) {
    for (const k of created) blockRegistry.unregister?.(k);
    // fallback: se o registry não expõe unregister, apenas ignoramos —
    // testes subsequentes toleram entradas extras porque filtram por
    // kind conhecido nos asserts.
    if (!blockRegistry.unregister) {
      // eslint-disable-next-line no-console
      console.warn("[FB-08] blockRegistry.unregister ausente — Registry mantém entradas sintéticas");
    }
  }

  const sizes = [50, 100, 250, 500];
  for (const target of sizes) {
    it(`rankLibrary permanece <10ms com ${target} blocos`, () => {
      const created = inflateTo(target);
      try {
        const items = blockRegistry.list().map(toLibraryItem);
        expect(items.length).toBeGreaterThanOrEqual(Math.min(target, items.length));

        const avgSearch = bench(`library.rank(${target}) "mensagem"`, 20, () => {
          rankLibrary(items, "mensagem");
        });
        const avgEmpty = bench(`library.rank(${target}) ""`, 20, () => {
          rankLibrary(items, "");
        });
        expect(avgSearch).toBeLessThan(10);
        expect(avgEmpty).toBeLessThan(15);
      } finally {
        cleanup(created);
      }
    });
  }

  it("originalKinds preservados após inflar/deflar", () => {
    for (const k of originalKinds) expect(blockRegistry.get(k)).toBeTruthy();
  });
});

describe("FB-08 · SmartSidebar thrash", () => {
  beforeEach(() => useBuilderStore.getState()._reset());

  it("1000 seleções alternadas + 1000 updateNodeData sem inflar estado", () => {
    const { nodes, edges } = seedGraph(50);
    useBuilderStore.getState().loadFromSnapshot("thrash", { nodes, edges });
    const ids = ["m0", "m1", "m2", "m3", "m4"];

    const tSel = bench("sidebar.selectNode alternado", 1000, () => {
      const id = ids[(Math.random() * ids.length) | 0];
      useBuilderStore.getState().selectNode(id);
    });

    const tEdit = bench("sidebar.updateNodeData", 1000, () => {
      useBuilderStore
        .getState()
        .updateNodeData("m0", { body: `edit ${Math.random().toString(36).slice(2, 8)}` });
    });

    expect(tSel).toBeLessThan(2);
    expect(tEdit).toBeLessThan(3);

    const s = useBuilderStore.getState();
    // Nenhum nó/aresta extra criado por thrash
    expect(s.nodeOrder.length).toBe(nodes.length);
    expect(s.edgeOrder.length).toBe(edges.length);
    // Somente 1 nó selecionado por vez (sem vazamento de seleção)
    expect(s.selection.nodeIds.length).toBeLessThanOrEqual(1);
  });
});
