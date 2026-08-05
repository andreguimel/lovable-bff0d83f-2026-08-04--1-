/**
 * FB-02 — Round-trip do serializer.
 *
 * Regra dura: `toServer(fromServer(x))` produz um DTO estruturalmente
 * equivalente a `x` para qualquer fluxo válido. Isso garante que abrir
 * e salvar um fluxo antigo NÃO altera nada no banco.
 */
import { describe, it, expect } from "bun:test";
import { fromServer, toServer } from "../io/serializer";
import type { LoadedGraphDTO } from "../io/serializer";

const fixture: LoadedGraphDTO = {
  nodes: [
    {
      id: "n-start",
      node_type: "start",
      position: { x: 0, y: 0 },
      data: { label: "Início" },
    },
    {
      id: "n-msg",
      node_type: "message",
      position: { x: 200, y: 40 },
      data: { label: "Boas vindas", body: "Olá {{contact.name}}!" },
    },
    {
      id: "n-cond",
      node_type: "condition",
      position: { x: 420, y: 60 },
      data: { expression: "contact.tags contains 'VIP'" },
    },
    {
      id: "n-end",
      node_type: "end",
      position: { x: 640, y: 60 },
      data: {},
    },
  ],
  edges: [
    {
      id: "e1",
      source_node_id: "n-start",
      target_node_id: "n-msg",
      source_handle: null,
      label: null,
    },
    {
      id: "e2",
      source_node_id: "n-msg",
      target_node_id: "n-cond",
      source_handle: null,
      label: null,
    },
    {
      id: "e3",
      source_node_id: "n-cond",
      target_node_id: "n-end",
      source_handle: "true",
      label: "sim",
    },
  ],
};

describe("flow-builder serializer", () => {
  it("round-trip: toServer(fromServer(x)) === x (estrutural)", () => {
    const snapshot = fromServer(fixture);
    const back = toServer(snapshot);

    expect(back.nodes).toHaveLength(fixture.nodes.length);
    expect(back.edges).toHaveLength(fixture.edges.length);

    for (let i = 0; i < fixture.nodes.length; i++) {
      const src = fixture.nodes[i];
      const out = back.nodes[i];
      expect(out.id).toBe(src.id);
      expect(out.node_type).toBe(src.node_type!);
      expect(out.position).toEqual(src.position!);
      expect(out.data).toEqual(src.data!);
    }

    for (let i = 0; i < fixture.edges.length; i++) {
      const src = fixture.edges[i];
      const out = back.edges[i];
      expect(out.id).toBe(src.id);
      expect(out.source_node_id).toBe(src.source_node_id);
      expect(out.target_node_id).toBe(src.target_node_id);
      expect(out.source_handle).toBe(src.source_handle ?? null);
      expect(out.label).toBe(src.label ?? null);
    }
  });

  it("tolera position ausente (fallback 0,0)", () => {
    const snap = fromServer({
      nodes: [{ id: "x", node_type: "message", data: {} }],
      edges: [],
    });
    expect(snap.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("preserva kinds ainda não migrados (V1 → V2 sem perda)", () => {
    const dto: LoadedGraphDTO = {
      nodes: [
        {
          id: "n-legacy",
          node_type: "kind_novo_desconhecido",
          position: { x: 10, y: 20 },
          data: { foo: "bar", n: 42 },
        },
      ],
      edges: [],
    };
    const back = toServer(fromServer(dto));
    expect(back.nodes[0]).toEqual({
      id: "n-legacy",
      node_type: "kind_novo_desconhecido",
      position: { x: 10, y: 20 },
      data: { foo: "bar", n: 42 },
    });
  });
});
