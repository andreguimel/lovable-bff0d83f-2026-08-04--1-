/**
 * FB-10.4A — Round-trip do Menu através do serializer universal e
 * validação (Health) do bloco Menu contra o Registry.
 */
import { describe, it, expect } from "bun:test";
import { blockRegistry } from "../blocks/registry";
import { ensureLegacyBlocksRegistered } from "../blocks/definitions";
import { fromServer, toServer, roundTrip } from "../io/serializer";

// Registra os blocos uma vez.
ensureLegacyBlocksRegistered();

const graph = {
  nodes: [
    { id: "n1", node_type: "start", position: { x: 0, y: 0 }, data: { label: "Início" } },
    {
      id: "n2",
      node_type: "menu",
      position: { x: 260, y: 0 },
      data: {
        label: "Menu principal",
        body: "Como podemos ajudar?",
        options: [
          { id: "opt_a", label: "Atendimento" },
          { id: "opt_b", label: "Boleto" },
          { id: "opt_c", label: "Cancelamento" },
        ],
        max_attempts: 3,
        invalid_message: "Escolha 1, 2 ou 3.",
      },
    },
    { id: "n3", node_type: "end", position: { x: 600, y: 0 }, data: {} },
  ],
  edges: [
    { id: "e1", source_node_id: "n1", target_node_id: "n2", source_handle: "default", label: null },
    { id: "e2", source_node_id: "n2", target_node_id: "n3", source_handle: "opt_a", label: null },
    { id: "e3", source_node_id: "n2", target_node_id: "n3", source_handle: "opt_b", label: null },
    { id: "e4", source_node_id: "n2", target_node_id: "n3", source_handle: "opt_c", label: null },
    { id: "e5", source_node_id: "n2", target_node_id: "n3", source_handle: "invalid", label: null },
  ],
};

describe("FB-10.4A — Menu round-trip + health", () => {
  it("registry expõe bloco 'menu' com getHandles dinâmico", () => {
    const def = blockRegistry.get("menu");
    expect(def).toBeDefined();
    const handles = def!.getHandles!(graph.nodes[1].data as never);
    expect(handles.in).toBe(1);
    const outIds = handles.out.map((o) => o.id);
    expect(outIds).toEqual(["opt_a", "opt_b", "opt_c", "invalid"]);
  });

  it("round-trip preserva pergunta, opções (IDs + labels), max_attempts e invalid_message", () => {
    const rt = roundTrip(graph);
    const menu = rt.nodes.find((n) => n.node_type === "menu")!;
    expect(menu.data.body).toBe("Como podemos ajudar?");
    expect(menu.data.max_attempts).toBe(3);
    expect(menu.data.invalid_message).toBe("Escolha 1, 2 ou 3.");
    const opts = menu.data.options as Array<{ id: string; label: string }>;
    expect(opts.map((o) => o.id)).toEqual(["opt_a", "opt_b", "opt_c"]);
    expect(opts.map((o) => o.label)).toEqual(["Atendimento", "Boleto", "Cancelamento"]);
    // Edges preservam os handles por option_id.
    const handles = rt.edges.filter((e) => e.source_node_id === "n2").map((e) => e.source_handle);
    expect(handles.sort()).toEqual(["invalid", "opt_a", "opt_b", "opt_c"]);
  });

  it("editar apenas o label de uma opção NÃO altera o ID → edge sobrevive", () => {
    const snap = fromServer(graph);
    const menuNode = snap.nodes.find((n) => n.kind === "menu")!;
    const opts = (menuNode.data as { options: Array<{ id: string; label: string }> }).options;
    opts[1] = { ...opts[1], label: "2ª via de boleto" };
    const out = toServer(snap);
    const edges = out.edges.filter((e) => e.source_node_id === "n2");
    // Edge do opt_b continua conectado — nenhum handle silenciosamente alterado.
    expect(edges.find((e) => e.source_handle === "opt_b")).toBeDefined();
  });

  it("Health: body vazio → erro impeditivo", () => {
    const def = blockRegistry.require("menu");
    const r = def.validate!({
      body: "",
      options: [
        { id: "opt_a", label: "A" },
        { id: "opt_b", label: "B" },
      ],
    } as never);
    expect(r.valid).toBe(false);
    expect(r.issues[0].path).toBe("body");
  });

  it("Health: apenas 1 opção → erro impeditivo", () => {
    const def = blockRegistry.require("menu");
    const r = def.validate!({
      body: "Q?",
      options: [{ id: "opt_a", label: "Só uma" }],
    } as never);
    expect(r.valid).toBe(false);
    expect(r.issues[0].path).toBe("options");
  });

  it("Health: opções duplicadas → erro impeditivo", () => {
    const def = blockRegistry.require("menu");
    const r = def.validate!({
      body: "Q?",
      options: [
        { id: "opt_a", label: "Igual" },
        { id: "opt_b", label: "igual" },
      ],
    } as never);
    expect(r.valid).toBe(false);
    expect(r.issues[0].path).toBe("options");
  });

  it("Health: IDs ausentes ou duplicados → erro impeditivo", () => {
    const def = blockRegistry.require("menu");
    const r = def.validate!({
      body: "Q?",
      options: [
        { id: "opt_a", label: "A" },
        { id: "opt_a", label: "B" },
      ],
    } as never);
    expect(r.valid).toBe(false);
  });

  it("Health: configuração válida → ok()", () => {
    const def = blockRegistry.require("menu");
    const r = def.validate!({
      body: "Q?",
      options: [
        { id: "opt_a", label: "A" },
        { id: "opt_b", label: "B" },
        { id: "opt_c", label: "C" },
      ],
      max_attempts: 2,
      invalid_message: "Escolha uma opção.",
    } as never);
    expect(r.valid).toBe(true);
  });
});
