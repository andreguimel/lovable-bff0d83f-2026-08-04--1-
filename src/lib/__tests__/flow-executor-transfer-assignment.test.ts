import { describe, expect, it, vi } from "vitest";
import { getPlugin } from "../flow-executor.server";

describe("Flow Executor - Transfer to Human Node Assignment", () => {
  it("executes transfer to specific agent", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const insertSpy = vi.fn().mockResolvedValue({ error: null });

    const mockCtx: any = {
      dryRun: false,
      conversation: { id: "conv-123", company_id: "comp-1" },
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "conversations") return { update: updateSpy };
          if (table === "conversation_transfers") return { insert: insertSpy };
          return {};
        }),
      },
    };

    const node: any = {
      id: "t1",
      kind: "transfer",
      node_type: "transfer",
      data: {
        target_type: "agent",
        agent_id: "user-456",
        agent_label: "Maria Santos",
        transfer_message: "Atendimento prioritário VIP",
      },
    };

    const plugin = getPlugin("transfer");
    expect(plugin).not.toBeNull();
    const res = await plugin!.execute(node, mockCtx);
    expect(res.status).toBe("ok");
    expect(res.output).toEqual({
      target_type: "agent",
      transferred_to: "user-456",
      department: null,
    });
    expect(updateSpy).toHaveBeenCalledWith({
      assigned_user_id: "user-456",
      assigned_agent_id: null,
    });
  });

  it("executes transfer to department / team", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    const mockCtx: any = {
      dryRun: false,
      conversation: { id: "conv-789", company_id: "comp-1" },
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "conversations") return { update: updateSpy };
          return {};
        }),
      },
    };

    const node: any = {
      id: "t2",
      kind: "transfer",
      node_type: "transfer",
      data: {
        target_type: "department",
        department: "Suporte",
      },
    };

    const plugin = getPlugin("transfer");
    expect(plugin).not.toBeNull();
    const res = await plugin!.execute(node, mockCtx);
    expect(res.status).toBe("ok");
    expect(res.output).toEqual({
      target_type: "department",
      transferred_to: null,
      department: "Suporte",
    });
    expect(updateSpy).toHaveBeenCalledWith({
      assigned_user_id: null,
      assigned_agent_id: null,
      department: "Suporte",
    });
  });
});
