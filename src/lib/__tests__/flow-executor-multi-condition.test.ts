import { describe, it, expect } from "vitest";
import { getPlugin } from "../flow-executor.server";

describe("Multi-Condition Node Execution (BotConversa Style)", () => {
  it("avalia lógica TODAS (E / AND) corretamente", async () => {
    const plugin = getPlugin("condition");
    expect(plugin).toBeDefined();

    const mockCtx = {
      runId: "run-cond-1",
      companyId: "co-1",
      flowId: "flow-1",
      supabase: {} as any,
      conversation: { id: "conv-1", channelId: "ch-1", contactId: "c-1" },
      contact: { id: "c-1", name: "Carlos", tags: ["VIP", "cliente_antigo"] },
      variables: {
        contact: { tags: ["VIP", "cliente_antigo"] },
        __is_open: true,
      },
      history: [],
      dryRun: true,
    };

    const nodeAllTrue = {
      id: "node-cond-1",
      node_type: "condition",
      data: {
        label: "Verificar VIP e Aberto",
        logic: "ALL",
        conditions: [
          { id: "c1", type: "tag", tag_name: "VIP", tag_operator: "has" },
          { id: "c2", type: "business_hours", business_hours_operator: "open" },
        ],
      },
    };

    const res = await plugin!.execute(nodeAllTrue, mockCtx as any);
    expect(res).toBeDefined();
    expect(res.status).toBe("ok");
    expect(res.nextHandle).toBe("true");

    const nodeOneFalse = {
      id: "node-cond-2",
      node_type: "condition",
      data: {
        label: "Verificar Inexistente e Aberto",
        logic: "ALL",
        conditions: [
          { id: "c1", type: "tag", tag_name: "Inexistente", tag_operator: "has" },
          { id: "c2", type: "business_hours", business_hours_operator: "open" },
        ],
      },
    };

    const resFalse = await plugin!.execute(nodeOneFalse, mockCtx as any);
    expect(resFalse.nextHandle).toBe("false");
  });

  it("avalia lógica QUALQUER (OU / OR) corretamente", async () => {
    const plugin = getPlugin("condition");
    expect(plugin).toBeDefined();

    const mockCtx = {
      runId: "run-cond-2",
      companyId: "co-1",
      flowId: "flow-1",
      supabase: {} as any,
      conversation: { id: "conv-1", channelId: "ch-1", contactId: "c-1" },
      contact: { id: "c-1", name: "Carlos", tags: ["VIP"] },
      variables: {
        contact: { tags: ["VIP"] },
        __is_open: false,
      },
      history: [],
      dryRun: true,
    };

    const nodeAnyTrue = {
      id: "node-cond-3",
      node_type: "condition",
      data: {
        label: "Verificar VIP ou Aberto",
        logic: "ANY",
        conditions: [
          { id: "c1", type: "tag", tag_name: "VIP", tag_operator: "has" },
          { id: "c2", type: "business_hours", business_hours_operator: "open" },
        ],
      },
    };

    const res = await plugin!.execute(nodeAnyTrue, mockCtx as any);
    expect(res.status).toBe("ok");
    expect(res.nextHandle).toBe("true");
  });
});
