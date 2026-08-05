/**
 * FB-10.4B — Round-trip do bloco Ação e Health via Registry.
 */
import { describe, expect, it } from "bun:test";
import { blockRegistry } from "../blocks/registry";
import { ensureLegacyBlocksRegistered } from "../blocks/definitions";
import { roundTrip } from "../io/serializer";

ensureLegacyBlocksRegistered();

describe("FB-10.4B · Bloco Ação · Registry + Round-trip + Health", () => {
  it("Registry expõe `action` com defaults consistentes", () => {
    const def = blockRegistry.get("action");
    expect(def).toBeDefined();
    expect(def!.meta.category).toBe("crm");
    expect(def!.meta.handles.out).toEqual([{ id: "default" }]);
    expect(def!.meta.defaults).toMatchObject({ action_type: "" });
  });

  it("preview humaniza cada action_type (sem UUID/JSON cru)", () => {
    const def = blockRegistry.require("action");
    expect(def.preview!({ action_type: "add_tag", tag_id: "u", tag_label: "VIP" } as never)).toContain("VIP");
    expect(def.preview!({ action_type: "remove_tag", tag_label: "Lead" } as never)).toContain("Lead");
    expect(def.preview!({ action_type: "assign_agent", agent_user_label: "Maria" } as never)).toContain("Maria");
    expect(def.preview!({ action_type: "" } as never)).toBeNull();
  });

  it("Health bloqueia publicação quando ação/etiqueta/atendente ausentes", () => {
    const empty = blockRegistry.validate("action", { action_type: "" });
    expect(empty.valid).toBe(false);

    const noTag = blockRegistry.validate("action", { action_type: "add_tag" });
    expect(noTag.valid).toBe(false);
    expect(noTag.issues[0].path).toBe("tag_id");

    const noUser = blockRegistry.validate("action", { action_type: "assign_agent" });
    expect(noUser.valid).toBe(false);
    expect(noUser.issues[0].path).toBe("agent_user_id");

    const okTag = blockRegistry.validate("action", { action_type: "add_tag", tag_id: "t-1" });
    expect(okTag.valid).toBe(true);
    const okAssign = blockRegistry.validate("action", {
      action_type: "assign_agent",
      agent_user_id: "u-1",
    });
    expect(okAssign.valid).toBe(true);
  });

  it("round-trip preserva action_type + IDs técnicos + labels humanos", () => {
    const graph = {
      nodes: [
        { id: "n1", node_type: "start", position: { x: 0, y: 0 }, data: {} },
        {
          id: "n2",
          node_type: "action",
          position: { x: 260, y: 0 },
          data: {
            label: "Ação",
            action_type: "add_tag",
            tag_id: "tag-uuid-1",
            tag_label: "Lead qualificado",
          },
        },
        {
          id: "n3",
          node_type: "action",
          position: { x: 520, y: 0 },
          data: {
            label: "Ação",
            action_type: "assign_agent",
            agent_user_id: "user-uuid-9",
            agent_user_label: "Maria Silva",
          },
        },
      ],
      edges: [
        { id: "e1", source_node_id: "n1", target_node_id: "n2", source_handle: "default", label: null },
        { id: "e2", source_node_id: "n2", target_node_id: "n3", source_handle: "default", label: null },
      ],
    };

    const rt = roundTrip(graph);
    const tagAction = rt.nodes.find((n) => n.id === "n2")!;
    const assignAction = rt.nodes.find((n) => n.id === "n3")!;
    expect(tagAction.data).toMatchObject({
      action_type: "add_tag",
      tag_id: "tag-uuid-1",
      tag_label: "Lead qualificado",
    });
    expect(assignAction.data).toMatchObject({
      action_type: "assign_agent",
      agent_user_id: "user-uuid-9",
      agent_user_label: "Maria Silva",
    });
    // Edge preservada.
    expect(rt.edges.find((e) => e.source_node_id === "n2" && e.source_handle === "default")).toBeDefined();
  });
});
