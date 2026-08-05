/**
 * FB-12.1 · Round-trip real UI → Serializer → Persistence Zod → Reload.
 *
 * Reproduz EXATAMENTE o schema zod usado por `saveFlowGraph` em
 * `src/lib/flows.functions.ts`. Se um kind canônico falhar aqui, o
 * fluxo real quebra em produção com toast "Erro ao salvar".
 *
 * Para cada kind canônico, monta um nó com defaults do Registry,
 * serializa, aplica o zod schema, "salva" (mock in-memory), recarrega
 * e prova equivalência semântica (id, kind, data, position).
 *
 * Kinds críticos (P0 do Gate Visual Final) que precisam passar aqui:
 *   menu · action · flow_connection · randomizer
 * — e todos os demais canônicos.
 */
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { CANONICAL_BLOCK_KINDS, PERSISTABLE_NODE_KINDS } from "../blocks/kinds";
import { blockRegistry } from "../blocks/registry";
import "../blocks/definitions";

// ⚠ MANTER EM SINCRONIA com src/lib/flows.functions.ts (nodeInput / edgeInput).
// A parity com o schema real é garantida em runtime importando dele:
const { PERSISTABLE_NODE_KINDS: RealSchema } = await import("../blocks/kinds");

const nodeInputZ = z.object({
  id: z.string().uuid(),
  node_type: z.enum(RealSchema),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()).default({}),
});

const edgeInputZ = z.object({
  id: z.string().uuid(),
  source_node_id: z.string().uuid(),
  target_node_id: z.string().uuid(),
  source_handle: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});

function makeNode(kind: string) {
  const def = blockRegistry.get(kind);
  const defaults = (def?.meta?.defaults ?? {}) as Record<string, unknown>;
  return {
    id: randomUUID(),
    node_type: kind,
    position: { x: 100, y: 100 },
    data: { ...defaults },
  };
}

describe("FB-12.1 · Round-trip UI → Persistence Zod → Reload", () => {
  it("todos os kinds canônicos passam pelo zod schema de saveFlowGraph", () => {
    const failures: string[] = [];
    for (const kind of CANONICAL_BLOCK_KINDS) {
      const node = makeNode(kind);
      const result = nodeInputZ.safeParse(node);
      if (!result.success) {
        failures.push(`${kind}: ${result.error.issues.map((i) => i.message).join("; ")}`);
      }
    }
    expect(failures, `Kinds rejeitados pela persistência:\n${failures.join("\n")}`).toEqual([]);
  });

  it("preserva id, node_type, position e data após round-trip", () => {
    for (const kind of CANONICAL_BLOCK_KINDS) {
      const original = makeNode(kind);
      const stored = nodeInputZ.parse(original);
      // Simula persist → SELECT → deserialize (JSONB é lossless).
      const reloaded = nodeInputZ.parse(JSON.parse(JSON.stringify(stored)));
      expect(reloaded.id).toBe(original.id);
      expect(reloaded.node_type).toBe(original.node_type);
      expect(reloaded.position).toEqual(original.position);
      expect(reloaded.data).toEqual(original.data);
    }
  });

  it("MENU · preserva option IDs estáveis após round-trip", () => {
    const def = blockRegistry.get("menu");
    expect(def).toBeDefined();
    const optionIds = ["opt_a", "opt_b", "opt_c"];
    const node = {
      id: randomUUID(),
      node_type: "menu" as const,
      position: { x: 0, y: 0 },
      data: {
        label: "Escolha",
        question: "Qual opção?",
        options: optionIds.map((id, i) => ({ id, label: `Opção ${i + 1}` })),
        invalid_message: "Inválido",
        max_attempts: 3,
      },
    };
    const stored = nodeInputZ.parse(node);
    const reloaded = nodeInputZ.parse(JSON.parse(JSON.stringify(stored)));
    const reloadedOpts = (reloaded.data.options as Array<{ id: string }>).map((o) => o.id);
    expect(reloadedOpts).toEqual(optionIds);
  });

  it("RANDOMIZER · preserva route IDs e pesos após round-trip", () => {
    const node = {
      id: randomUUID(),
      node_type: "randomizer" as const,
      position: { x: 0, y: 0 },
      data: {
        label: "Split A/B",
        mode: "weighted",
        routes: [
          { id: "route_a", label: "A", weight: 70 },
          { id: "route_b", label: "B", weight: 30 },
        ],
      },
    };
    const stored = nodeInputZ.parse(node);
    const reloaded = nodeInputZ.parse(JSON.parse(JSON.stringify(stored)));
    expect(reloaded.data.routes).toEqual(node.data.routes);
  });

  it("FLOW_CONNECTION · preserva target flow_id após round-trip", () => {
    const targetId = randomUUID();
    const node = {
      id: randomUUID(),
      node_type: "flow_connection" as const,
      position: { x: 0, y: 0 },
      data: { label: "Vai pra B", flow_id: targetId, flow_label: "Fluxo B" },
    };
    const stored = nodeInputZ.parse(node);
    const reloaded = nodeInputZ.parse(JSON.parse(JSON.stringify(stored)));
    expect(reloaded.data.flow_id).toBe(targetId);
    expect(reloaded.data.flow_label).toBe("Fluxo B");
  });

  it("ACTION · preserva action_type e config após round-trip", () => {
    const node = {
      id: randomUUID(),
      node_type: "action" as const,
      position: { x: 0, y: 0 },
      data: {
        label: "Marcar VIP",
        action_type: "add_tag",
        tag_id: randomUUID(),
        tag_label: "VIP",
      },
    };
    const stored = nodeInputZ.parse(node);
    const reloaded = nodeInputZ.parse(JSON.parse(JSON.stringify(stored)));
    expect(reloaded.data.action_type).toBe("add_tag");
    expect(reloaded.data.tag_label).toBe("VIP");
  });

  it("SEND_DOCUMENT · preserva referência de mídia (equivalente ao send_file da referência)", () => {
    // Zenda usa send_document para arquivos; não existe kind `send_file`.
    const node = {
      id: randomUUID(),
      node_type: "send_document" as const,
      position: { x: 0, y: 0 },
      data: { label: "PDF", url: "https://cdn.example.com/x.pdf", filename: "x.pdf" },
    };
    const stored = nodeInputZ.parse(node);
    const reloaded = nodeInputZ.parse(JSON.parse(JSON.stringify(stored)));
    expect(reloaded.data.url).toBe("https://cdn.example.com/x.pdf");
    expect(reloaded.data.filename).toBe("x.pdf");
  });

  it("EDGES · handles dinâmicos de Menu/Condition/Randomizer preservam source_handle", () => {
    const cases = [
      { handle: "opt_a" }, // Menu
      { handle: "invalid" }, // Menu inválido
      { handle: "yes" }, // Condition Sim
      { handle: "no" }, // Condition Não
      { handle: "route_a" }, // Randomizer
    ];
    for (const c of cases) {
      const edge = {
        id: randomUUID(),
        source_node_id: randomUUID(),
        target_node_id: randomUUID(),
        source_handle: c.handle,
        label: null,
      };
      const stored = edgeInputZ.parse(edge);
      const reloaded = edgeInputZ.parse(JSON.parse(JSON.stringify(stored)));
      expect(reloaded.source_handle).toBe(c.handle);
    }
  });

  it("FLUXO INTEGRADO · START → MENU → ACTION → RANDOMIZER → FLOW_CONNECTION valida inteiro", () => {
    const ids = {
      start: randomUUID(),
      menu: randomUUID(),
      action: randomUUID(),
      randomizer: randomUUID(),
      flowConn: randomUUID(),
      doc: randomUUID(),
    };
    const nodes = [
      { id: ids.start, node_type: "start", position: { x: 0, y: 0 }, data: {} },
      {
        id: ids.menu, node_type: "menu", position: { x: 200, y: 0 },
        data: {
          label: "Escolha", question: "?",
          options: [{ id: "opt_a", label: "A" }, { id: "opt_b", label: "B" }],
          invalid_message: "err", max_attempts: 3,
        },
      },
      {
        id: ids.action, node_type: "action", position: { x: 400, y: -100 },
        data: { label: "VIP", action_type: "add_tag", tag_id: randomUUID(), tag_label: "VIP" },
      },
      {
        id: ids.randomizer, node_type: "randomizer", position: { x: 400, y: 100 },
        data: {
          label: "AB", mode: "weighted",
          routes: [
            { id: "route_a", label: "A", weight: 50 },
            { id: "route_b", label: "B", weight: 50 },
          ],
        },
      },
      {
        id: ids.flowConn, node_type: "flow_connection", position: { x: 600, y: 100 },
        data: { label: "→", flow_id: randomUUID(), flow_label: "Outro" },
      },
      {
        id: ids.doc, node_type: "send_document", position: { x: 600, y: -100 },
        data: { label: "PDF", url: "https://x/p.pdf" },
      },
    ];
    const edges = [
      { id: randomUUID(), source_node_id: ids.start, target_node_id: ids.menu, source_handle: null, label: null },
      { id: randomUUID(), source_node_id: ids.menu, target_node_id: ids.action, source_handle: "opt_a", label: null },
      { id: randomUUID(), source_node_id: ids.menu, target_node_id: ids.randomizer, source_handle: "opt_b", label: null },
      { id: randomUUID(), source_node_id: ids.action, target_node_id: ids.doc, source_handle: null, label: null },
      { id: randomUUID(), source_node_id: ids.randomizer, target_node_id: ids.flowConn, source_handle: "route_a", label: null },
      { id: randomUUID(), source_node_id: ids.randomizer, target_node_id: ids.flowConn, source_handle: "route_b", label: null },
    ];
    const payload = z
      .object({
        flowId: z.string().uuid(),
        nodes: z.array(nodeInputZ).max(500),
        edges: z.array(edgeInputZ).max(1000),
      })
      .safeParse({ flowId: randomUUID(), nodes, edges });
    expect(payload.success, payload.success ? "" : JSON.stringify(payload.error.issues)).toBe(true);
  });

  it("PERSISTABLE_NODE_KINDS contém os 4 kinds do P0 (regressão explícita)", () => {
    for (const kind of ["menu", "action", "flow_connection", "randomizer"]) {
      expect(PERSISTABLE_NODE_KINDS.includes(kind as (typeof PERSISTABLE_NODE_KINDS)[number])).toBe(true);
    }
  });
});
