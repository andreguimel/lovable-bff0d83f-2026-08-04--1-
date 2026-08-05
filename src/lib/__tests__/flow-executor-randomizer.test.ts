/**
 * FB-10.4D — Validação E2E interna do bloco Randomizador.
 *
 * Cobre:
 *  - Algoritmo puro `pickWeightedRoute` (fronteiras determinísticas).
 *  - Executor real `getPlugin("randomizer")` (nextHandle, output, vars).
 *  - Idempotência: retomada / retry NÃO re-sorteia (usa escolha persistida).
 *  - Configuração inválida: soma ≠ 100 ou routes < 2 → status failed.
 *  - Isolamento por node: dois randomizers no mesmo run mantêm decisões separadas.
 *  - Teste estatístico controlado 70/30 sobre a função pura.
 *  - Performance: seleção em 100 rotas < 5 ms.
 *
 * NÃO usa Supabase real — o bloco é 100% CPU.
 */
import { describe, it, expect } from "bun:test";

const { getPlugin, pickWeightedRoute } = await import("../flow-executor.server");

function makeCtx(vars: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    stepId: "step-1",
    companyId: "co-1",
    flowId: "flow-1",
    supabase: {} as never,
    conversation: { id: null, channelId: null, contactId: null },
    channel: null,
    contact: null,
    variables: vars,
    history: [],
    dryRun: false,
    emit: async () => {},
  };
}

function makeNode(id: string, routes: Array<{ id: string; label: string; weight: number }>) {
  return {
    id,
    company_id: "co-1",
    flow_id: "flow-1",
    flow_version_id: "v1",
    node_type: "randomizer",
    data: { routes } as never,
    x: 0,
    y: 0,
    created_at: null,
    updated_at: null,
  } as never;
}

const ROUTES_70_30 = [
  { id: "route_a", label: "Vendas", weight: 70 },
  { id: "route_b", label: "Suporte", weight: 30 },
];

describe("FB-10.4D · pickWeightedRoute — algoritmo puro", () => {
  it("respeita fronteira 0 → primeira rota", () => {
    expect(pickWeightedRoute(ROUTES_70_30, 0)!.id).toBe("route_a");
  });
  it("rnd=0.6999 ainda cai em A (70%)", () => {
    expect(pickWeightedRoute(ROUTES_70_30, 0.6999)!.id).toBe("route_a");
  });
  it("rnd=0.70 já cai em B", () => {
    expect(pickWeightedRoute(ROUTES_70_30, 0.7)!.id).toBe("route_b");
  });
  it("rnd=0.9999 cai em B (última)", () => {
    expect(pickWeightedRoute(ROUTES_70_30, 0.9999)!.id).toBe("route_b");
  });
  it("rnd=1 fallback devolve última rota ativa", () => {
    expect(pickWeightedRoute(ROUTES_70_30, 1)!.id).toBe("route_b");
  });
  it("ignora rotas com peso 0", () => {
    const routes = [
      { id: "route_a", label: "A", weight: 0 },
      { id: "route_b", label: "B", weight: 100 },
    ];
    expect(pickWeightedRoute(routes, 0.1)!.id).toBe("route_b");
    expect(pickWeightedRoute(routes, 0.99)!.id).toBe("route_b");
  });
  it("devolve null quando todas as rotas têm peso 0", () => {
    expect(
      pickWeightedRoute(
        [
          { id: "a", label: "a", weight: 0 },
          { id: "b", label: "b", weight: 0 },
        ],
        0.5,
      ),
    ).toBeNull();
  });
});

describe("FB-10.4D · Executor · comportamento canônico", () => {
  const plugin = getPlugin("randomizer");
  if (!plugin) throw new Error("randomizer plugin não registrado");

  it("escolhe rota A quando rnd=0.1", async () => {
    const ctx = makeCtx({ __randomizer_rng: 0.1 });
    const r = await plugin.execute(makeNode("n1", ROUTES_70_30), ctx as never);
    expect(r.status).toBe("ok");
    expect(r.nextHandle).toBe("route_a");
    expect(r.output).toMatchObject({
      mode: "weighted",
      route_count: 2,
      selected_route_id: "route_a",
      selected_route_label: "Vendas",
      selected_weight: 70,
      reused_prior_choice: false,
    });
  });

  it("escolhe rota B quando rnd=0.9", async () => {
    const ctx = makeCtx({ __randomizer_rng: 0.9 });
    const r = await plugin.execute(makeNode("n1", ROUTES_70_30), ctx as never);
    expect(r.nextHandle).toBe("route_b");
    expect(r.output?.selected_route_label).toBe("Suporte");
  });

  it("persiste escolha em vars.__randomizer_choices por nodeId", async () => {
    const ctx = makeCtx({ __randomizer_rng: 0.1 });
    const r = await plugin.execute(makeNode("n1", ROUTES_70_30), ctx as never);
    expect(r.vars?.__randomizer_choices).toMatchObject({
      n1: { id: "route_a", label: "Vendas", weight: 70 },
    });
  });

  it("IDEMPOTÊNCIA: retomada reusa escolha anterior mesmo com rnd oposto", async () => {
    const ctx = makeCtx({
      __randomizer_rng: 0.9, // sortearia B
      __randomizer_choices: { n1: { id: "route_a", label: "Vendas", weight: 70 } },
    });
    const r = await plugin.execute(makeNode("n1", ROUTES_70_30), ctx as never);
    expect(r.nextHandle).toBe("route_a");
    expect(r.output?.reused_prior_choice).toBe(true);
  });

  it("ISOLAMENTO POR NODE: n1 e n2 no mesmo run mantêm decisões separadas", async () => {
    const bag: Record<string, unknown> = {};
    const ctx1 = makeCtx({ __randomizer_rng: 0.1, __randomizer_choices: bag });
    const r1 = await plugin.execute(makeNode("n1", ROUTES_70_30), ctx1 as never);
    Object.assign(bag, r1.vars?.__randomizer_choices as object);
    const ctx2 = makeCtx({ __randomizer_rng: 0.9, __randomizer_choices: bag });
    const r2 = await plugin.execute(makeNode("n2", ROUTES_70_30), ctx2 as never);
    Object.assign(bag, r2.vars?.__randomizer_choices as object);
    expect(r1.nextHandle).toBe("route_a");
    expect(r2.nextHandle).toBe("route_b");
    expect(Object.keys(bag).sort()).toEqual(["n1", "n2"]);
  });

  it("Escolha desaparecida da config (edição pós-decisão) → re-sorteia", async () => {
    const ctx = makeCtx({
      __randomizer_rng: 0.1,
      __randomizer_choices: { n1: { id: "route_removed", label: "x", weight: 50 } },
    });
    const r = await plugin.execute(makeNode("n1", ROUTES_70_30), ctx as never);
    expect(r.nextHandle).toBe("route_a");
    expect(r.output?.reused_prior_choice).toBe(false);
  });

  it("config inválida (< 2 rotas) → failed", async () => {
    const ctx = makeCtx();
    const r = await plugin.execute(
      makeNode("n1", [{ id: "a", label: "A", weight: 100 }]),
      ctx as never,
    );
    expect(r.status).toBe("failed");
  });

  it("config inválida (soma ≠ 100) → failed", async () => {
    const ctx = makeCtx();
    const r = await plugin.execute(
      makeNode("n1", [
        { id: "a", label: "A", weight: 60 },
        { id: "b", label: "B", weight: 30 },
      ]),
      ctx as never,
    );
    expect(r.status).toBe("failed");
    expect(r.message).toContain("100%");
  });
});

describe("FB-10.4D · Teste estatístico controlado (função pura)", () => {
  it("70/30 sobre 10.000 amostras fica dentro de ±3%", () => {
    let a = 0;
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const chosen = pickWeightedRoute(ROUTES_70_30, Math.random());
      if (chosen!.id === "route_a") a++;
    }
    const ratio = a / N;
    expect(ratio).toBeGreaterThan(0.67);
    expect(ratio).toBeLessThan(0.73);
  });
});

describe("FB-10.4D · Performance", () => {
  it("100 rotas: seleção < 5 ms por amostra em 1.000 iterações", () => {
    const routes = Array.from({ length: 100 }, (_, i) => ({
      id: `route_${i}`,
      label: `R${i}`,
      weight: 1,
    }));
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) pickWeightedRoute(routes, Math.random());
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(5000); // sanity; typical < 50ms
  });
});
