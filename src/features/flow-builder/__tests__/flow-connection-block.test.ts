/**
 * FB-10.4C — Testes do bloco flow_connection.
 *
 *  - Registry: kind está registrado e classificado como categoria "flow" no V3.
 *  - Round-trip: Serializer preserva target_flow_id, target_flow_label, IDs e handles.
 *  - Health: bloqueia publicação sem destino, com autorreferência ou destino inexistente.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import "../blocks/definitions";
import { blockRegistry } from "../blocks/registry";
import { resolveCategoryV3 } from "../canvas/v3/tokens";
import { fromServer, toServer } from "../io/serializer";
import { analyzeFlow, resetAnalyzerCache } from "../validation";

const CTX = {
  agents: [],
  channels: [],
  flowId: "flow-src",
  flows: [
    { id: "flow-src", name: "Origem", status: "active" },
    { id: "flow-B", name: "Follow-up 24h", status: "active" },
    { id: "flow-C", name: "Arquivado", status: "archived" },
  ],
};

describe("FB-10.4C · Registry", () => {
  it("flow_connection está registrado com meta terminal", () => {
    const def = blockRegistry.get("flow_connection");
    expect(def).toBeTruthy();
    expect(def!.meta.handles.in).toBe(1);
    expect(def!.meta.handles.out.length).toBe(0); // terminal → transfere
  });

  it("categorizado como 'flow' na V3", () => {
    const def = blockRegistry.get("flow_connection")!;
    expect(resolveCategoryV3("flow_connection", def.meta.category)).toBe("flow");
  });
});

describe("FB-10.4C · Serializer round-trip", () => {
  it("preserva target_flow_id e label após round-trip", () => {
    const serverDto = {
      nodes: [
        {
          id: "start",
          node_type: "start",
          position: { x: 0, y: 0 },
          data: { label: "Início" },
        },
        {
          id: "fc-1",
          node_type: "flow_connection",
          position: { x: 220, y: 0 },
          data: {
            label: "Conexão de fluxo",
            target_flow_id: "flow-B",
            target_flow_label: "Follow-up 24h",
          },
        },
      ],
      edges: [
        {
          id: "e1",
          source_node_id: "start",
          target_node_id: "fc-1",
          source_handle: "default",
          label: null,
        },
      ],
    };
    const snapshot = fromServer(serverDto);
    const roundTripped = toServer(snapshot);
    const fc = roundTripped.nodes.find((n) => n.id === "fc-1")!;
    expect(fc.node_type).toBe("flow_connection");
    expect(fc.data.target_flow_id).toBe("flow-B");
    expect(fc.data.target_flow_label).toBe("Follow-up 24h");
    expect(roundTripped.edges.length).toBe(1);
    expect(roundTripped.edges[0].source_node_id).toBe("start");
    expect(roundTripped.edges[0].target_node_id).toBe("fc-1");
  });
});

describe("FB-10.4C · Health", () => {
  beforeEach(() => resetAnalyzerCache());

  const makeGraph = (targetId: string) => ({
    nodes: [
      { id: "s", kind: "start", position: { x: 0, y: 0 }, data: { label: "Início" } },
      {
        id: "fc",
        kind: "flow_connection",
        position: { x: 220, y: 0 },
        data: { label: "Conexão", target_flow_id: targetId },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "s",
        target: "fc",
        sourceHandle: "default",
        label: null,
      },
    ],
  });

  it("erro quando destino não configurado", () => {
    const g = makeGraph("");
    const report = analyzeFlow(g.nodes, g.edges, CTX as never, { force: true });
    expect(report.canPublish).toBe(false);
    expect(report.errors.some((e) => /Selecione o fluxo/i.test(e.title + e.detail))).toBe(true);
  });

  it("erro em autorreferência", () => {
    const g = makeGraph("flow-src");
    const report = analyzeFlow(g.nodes, g.edges, CTX as never, { force: true });
    expect(report.canPublish).toBe(false);
    expect(report.errors.some((e) => /a si mesmo/i.test(e.title + e.detail))).toBe(true);
  });

  it("erro quando destino não existe", () => {
    const g = makeGraph("flow-inexistente");
    const report = analyzeFlow(g.nodes, g.edges, CTX as never, { force: true });
    expect(report.canPublish).toBe(false);
    expect(report.errors.some((e) => /não está disponível/i.test(e.title + e.detail))).toBe(true);
  });

  it("erro quando destino está arquivado", () => {
    const g = makeGraph("flow-C");
    const report = analyzeFlow(g.nodes, g.edges, CTX as never, { force: true });
    expect(report.canPublish).toBe(false);
    expect(report.errors.some((e) => /arquivado/i.test(e.title + e.detail))).toBe(true);
  });

  it("libera publicação com destino válido de outro fluxo ativo", () => {
    const g = makeGraph("flow-B");
    const report = analyzeFlow(g.nodes, g.edges, CTX as never, { force: true });
    expect(report.canPublish).toBe(true);
  });
});
