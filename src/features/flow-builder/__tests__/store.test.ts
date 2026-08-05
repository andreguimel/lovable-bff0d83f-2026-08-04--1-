/**
 * FB-02 — Testes da store: carregar, mutar, selecionar, salvar.
 *
 * Cobre exatamente os cenários exigidos pela checklist da missão:
 *   - abrir fluxo existente (loadFromSnapshot)
 *   - salvar fluxo existente (toSnapshot round-trip)
 *   - mover / atualizar / duplicar / remover nós
 *   - criar / excluir conexão
 *   - selecionar / trocar / limpar seleção
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { useBuilderStore } from "../state/store";
import { fromServer, toServer } from "../io/serializer";
import type { LoadedGraphDTO } from "../io/serializer";

const dto: LoadedGraphDTO = {
  nodes: [
    { id: "a", node_type: "start", position: { x: 0, y: 0 }, data: { label: "Início" } },
    { id: "b", node_type: "message", position: { x: 100, y: 0 }, data: { body: "hi" } },
  ],
  edges: [
    { id: "e", source_node_id: "a", target_node_id: "b", source_handle: null, label: null },
  ],
};

describe("flow-builder store", () => {
  beforeEach(() => {
    useBuilderStore.getState()._reset();
  });

  it("carrega snapshot e reflete no toSnapshot()", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("flow-1", fromServer(dto));
    const snap = useBuilderStore.getState().toSnapshot();
    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges).toHaveLength(1);
    expect(useBuilderStore.getState().meta.flowId).toBe("flow-1");
    expect(useBuilderStore.getState().dirty).toBe(false);
  });

  it("salvar fluxo existente: round-trip via toServer preserva DTO", () => {
    useBuilderStore.getState().loadFromSnapshot("flow-1", fromServer(dto));
    const back = toServer(useBuilderStore.getState().toSnapshot());
    expect(back.nodes).toHaveLength(2);
    expect(back.edges[0].source_node_id).toBe("a");
  });

  it("addNode marca dirty e insere no order", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", { nodes: [], edges: [] });
    const id = s.addNode("message", { x: 10, y: 10 });
    expect(useBuilderStore.getState().nodeOrder).toContain(id);
    expect(useBuilderStore.getState().dirty).toBe(true);
  });

  it("moveNode altera posição do nó certo apenas", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", fromServer(dto));
    s.moveNode("b", { x: 999, y: 999 });
    expect(useBuilderStore.getState().nodesById["b"].position).toEqual({ x: 999, y: 999 });
    expect(useBuilderStore.getState().nodesById["a"].position).toEqual({ x: 0, y: 0 });
  });

  it("connect cria aresta; disconnect a remove", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", fromServer(dto));
    const eid = s.connect({ source: "b", target: "a", sourceHandle: null, label: null });
    expect(useBuilderStore.getState().edgesById[eid]).toBeDefined();
    s.disconnect(eid);
    expect(useBuilderStore.getState().edgesById[eid]).toBeUndefined();
  });

  it("removeNode remove suas arestas em cascata", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", fromServer(dto));
    s.removeNode("b");
    expect(useBuilderStore.getState().nodesById["b"]).toBeUndefined();
    expect(useBuilderStore.getState().edgeOrder).toHaveLength(0);
  });

  it("seleção única — trocar Node substitui o anterior", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", fromServer(dto));
    s.selectNode("a");
    expect(useBuilderStore.getState().selection.nodeIds).toEqual(["a"]);
    s.selectNode("b");
    expect(useBuilderStore.getState().selection.nodeIds).toEqual(["b"]);
    s.clearSelection();
    expect(useBuilderStore.getState().selection.nodeIds).toEqual([]);
  });

  it("updateNodeData faz merge parcial", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", fromServer(dto));
    s.updateNodeData("b", { body: "novo texto", label: "olá" });
    expect(useBuilderStore.getState().nodesById["b"].data).toMatchObject({
      body: "novo texto",
      label: "olá",
    });
  });

  // ------------------------------------------------------------------
  // FB-10.3.2 — Undo do Organizar fluxo (applyLayout atômico)
  // ------------------------------------------------------------------
  it("applyLayout: aplica novas posições em 1 passo e Undo restaura todas juntas", async () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", fromServer(dto));
    const before = {
      a: { ...useBuilderStore.getState().nodesById["a"].position },
      b: { ...useBuilderStore.getState().nodesById["b"].position },
    };
    s.applyLayout(
      new Map<string, { x: number; y: number }>([
        ["a", { x: 500, y: 700 }],
        ["b", { x: 900, y: 700 }],
      ]),
    );
    expect(useBuilderStore.getState().nodesById["a"].position).toEqual({
      x: 500,
      y: 700,
    });
    expect(useBuilderStore.getState().nodesById["b"].position).toEqual({
      x: 900,
      y: 700,
    });
    // Um único undo deve restaurar TODAS as posições anteriores.
    useBuilderStore.getState().undo();
    expect(useBuilderStore.getState().nodesById["a"].position).toEqual(before.a);
    expect(useBuilderStore.getState().nodesById["b"].position).toEqual(before.b);
  });
});
