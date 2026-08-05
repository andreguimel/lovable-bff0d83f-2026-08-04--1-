/**
 * FB-07 — Cobertura do motor de validação pré-voo.
 *
 * Cenários exigidos pela missão:
 *   fluxo perfeito, sem início, blocos incompletos, conexões inválidas,
 *   ramos inacessíveis, órfãos, ciclos, fluxo grande (100+ blocos),
 *   compatibilidade com fluxos legados (kinds pré-existentes).
 *
 * Também valida:
 *   - bloqueio correto de publicação (canPublish=false para erros);
 *   - navegação (issue.nodeId aponta para nó existente);
 *   - extensibilidade (registrar uma nova regra a quente).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import "../blocks/definitions";
import {
  analyzeFlow,
  resetAnalyzerCache,
  validatorRegistry,
  type GraphContext,
} from "../validation";
import type { BuilderEdge, BuilderNode } from "../state/types";

const ctx: GraphContext = {
  agents: [{ id: "a1", name: "Suporte", is_active: true }],
  channels: [{ id: "c1", name: "WhatsApp" }],
};

function node(id: string, kind: string, data: Record<string, unknown> = {}): BuilderNode {
  return { id, kind, position: { x: 0, y: 0 }, data };
}
function edge(id: string, source: string, target: string, sourceHandle: string | null = null): BuilderEdge {
  return { id, source, target, sourceHandle, label: null };
}

beforeEach(() => resetAnalyzerCache());

describe("FB-07 · Motor de validação", () => {
  it("fluxo perfeito passa sem erros", () => {
    const nodes = [
      node("s", "start", { label: "Início" }),
      node("m", "message", { body: "Olá {{contact.name}}" }),
      node("e", "end"),
    ];
    const edges = [edge("e1", "s", "m"), edge("e2", "m", "e")];
    const r = analyzeFlow(nodes, edges, ctx);
    expect(r.errors).toHaveLength(0);
    expect(r.canPublish).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("fluxo vazio bloqueia publicação", () => {
    const r = analyzeFlow([], [], ctx);
    expect(r.canPublish).toBe(false);
    expect(r.errors.some((i) => i.ruleId === "graph:start")).toBe(true);
  });

  it("fluxo sem início bloqueia publicação", () => {
    const nodes = [node("m", "message", { body: "oi" }), node("e", "end")];
    const edges = [edge("e1", "m", "e")];
    const r = analyzeFlow(nodes, edges, ctx);
    expect(r.canPublish).toBe(false);
    expect(r.errors.some((i) => i.title.includes("Fluxo sem início"))).toBe(true);
  });

  it("múltiplos inícios reportam erro por nó extra", () => {
    const nodes = [node("s1", "start"), node("s2", "start"), node("e", "end")];
    const edges = [edge("e1", "s1", "e")];
    const r = analyzeFlow(nodes, edges, ctx);
    const multi = r.errors.filter((i) => i.title.includes("Mais de um bloco de Início"));
    expect(multi.length).toBeGreaterThanOrEqual(1);
    expect(multi[0].nodeId).toBe("s2");
  });

  it("bloco incompleto (message sem body) reporta erro acionável", () => {
    const nodes = [node("s", "start"), node("m", "message", { body: "" }), node("e", "end")];
    const edges = [edge("a", "s", "m"), edge("b", "m", "e")];
    const r = analyzeFlow(nodes, edges, ctx);
    expect(r.errors.some((i) => i.nodeId === "m")).toBe(true);
    expect(r.canPublish).toBe(false);
  });

  it("conexão inválida (target inexistente) vira erro", () => {
    const nodes = [node("s", "start")];
    const edges = [edge("e1", "s", "ghost")];
    const r = analyzeFlow(nodes, edges, ctx);
    expect(
      r.errors.some((i) => i.title.includes("Conexão apontando para bloco inexistente")),
    ).toBe(true);
  });

  it("ramos inacessíveis viram warning", () => {
    const nodes = [
      node("s", "start"),
      node("m", "message", { body: "ok" }),
      node("island_a", "message", { body: "x" }),
      node("island_b", "end"),
    ];
    const edges = [edge("e1", "s", "m"), edge("e2", "island_a", "island_b")];
    const r = analyzeFlow(nodes, edges, ctx);
    expect(r.warnings.some((i) => i.title.includes("nunca será executado"))).toBe(true);
  });

  it("bloco solto (sem conexões) vira warning de órfão", () => {
    const nodes = [node("s", "start"), node("lonely", "end")];
    const edges: BuilderEdge[] = [];
    const r = analyzeFlow(nodes, edges, ctx);
    expect(r.warnings.some((i) => i.title.includes("solto no canvas"))).toBe(true);
  });

  it("ciclo detectado (loop entre 2 blocos)", () => {
    const nodes = [
      node("s", "start"),
      node("a", "message", { body: "1" }),
      node("b", "message", { body: "2" }),
    ];
    const edges = [
      edge("e1", "s", "a"),
      edge("e2", "a", "b"),
      edge("e3", "b", "a"),
    ];
    const r = analyzeFlow(nodes, edges, ctx);
    expect(r.warnings.some((i) => i.ruleId === "graph:cycle")).toBe(true);
  });

  it("referência a agente inexistente bloqueia publicação", () => {
    const nodes = [
      node("s", "start"),
      node("a", "assign_agent", { agent_id: "ghost" }),
      node("e", "end"),
    ];
    const edges = [edge("e1", "s", "a"), edge("e2", "a", "e")];
    const r = analyzeFlow(nodes, edges, ctx);
    expect(r.errors.some((i) => i.title.includes("Atendente"))).toBe(true);
    expect(r.canPublish).toBe(false);
  });

  it("fluxo grande (100+ blocos) analisa em <200ms", () => {
    const nodes: BuilderNode[] = [node("s", "start")];
    const edges: BuilderEdge[] = [];
    let prev = "s";
    for (let i = 0; i < 120; i++) {
      const id = `n${i}`;
      nodes.push(node(id, "message", { body: `passo ${i}` }));
      edges.push(edge(`e${i}`, prev, id));
      prev = id;
    }
    nodes.push(node("end", "end"));
    edges.push(edge("efin", prev, "end"));
    const t0 = performance.now();
    const r = analyzeFlow(nodes, edges, ctx, { force: true });
    const elapsed = performance.now() - t0;
    expect(r.canPublish).toBe(true);
    expect(r.metrics.nodeCount).toBe(122);
    expect(elapsed).toBeLessThan(200);
  });

  it("cache incremental devolve o mesmo objeto para snapshots iguais", () => {
    const nodes = [node("s", "start"), node("m", "message", { body: "x" }), node("e", "end")];
    const edges = [edge("a", "s", "m"), edge("b", "m", "e")];
    const r1 = analyzeFlow(nodes, edges, ctx);
    const r2 = analyzeFlow(nodes, edges, ctx);
    expect(r1).toBe(r2);
  });

  it("issues carregam nodeId válido para navegação", () => {
    const nodes = [node("s", "start"), node("m", "message", { body: "" }), node("e", "end")];
    const edges = [edge("a", "s", "m"), edge("b", "m", "e")];
    const r = analyzeFlow(nodes, edges, ctx);
    for (const i of [...r.errors, ...r.warnings]) {
      if (!i.nodeId) continue;
      expect(nodes.some((n) => n.id === i.nodeId)).toBe(true);
    }
  });

  it("registry aceita nova regra sem alterar o engine", () => {
    validatorRegistry.registerGraph({
      id: "test:custom",
      run: ({ nodes, emit }) => {
        if (nodes.length === 1)
          emit({
            id: "test:custom:only-one",
            ruleId: "test:custom",
            severity: "info",
            title: "Só um bloco",
            detail: "Regra de teste.",
          });
      },
    });
    const r = analyzeFlow([node("s", "start")], [], ctx, { force: true });
    expect(r.infos.some((i) => i.ruleId === "test:custom")).toBe(true);
  });

  it("compatibilidade — fluxo legado com kinds antigos ainda é analisado", () => {
    const nodes = [
      node("s", "start"),
      node("legacy", "wait_reply", { timeout_seconds: 60 }),
      node("e", "end"),
    ];
    const edges = [edge("a", "s", "legacy"), edge("b", "legacy", "e")];
    const r = analyzeFlow(nodes, edges, ctx, { force: true });
    expect(r).toBeDefined();
    expect(r.metrics.nodeCount).toBe(3);
  });
});
