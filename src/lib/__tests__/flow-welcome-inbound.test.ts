import { describe, expect, it } from "vitest";

import { startWelcomeFlowForNewContact } from "@/lib/flow-welcome-inbound.server";

type Row = Record<string, unknown> | null;

/** Supabase client mínimo: devolve a linha configurada por tabela. */
function fakeSupabase(rows: {
  flow_runs?: Row[];
  flows?: Row;
  messagesCount?: number;
}) {
  const runQueue = [...(rows.flow_runs ?? [null, null])];
  return {
    from(table: string) {
      let head = false;
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "maybeSingle") {
              return async () => {
                if (table === "flow_runs") return { data: runQueue.shift() ?? null };
                if (table === "flows") return { data: rows.flows ?? null };
                return { data: null };
              };
            }
            if (prop === "select") {
              return (_cols: string, opts?: { head?: boolean }) => {
                if (opts?.head) head = true;
                return chain;
              };
            }
            if (prop === "then") {
              if (!head) return undefined;
              return (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ count: rows.messagesCount ?? 0 }).then(resolve);
            }
            return () => chain;
          },
        },
      );
      return chain;
    },
  } as never;
}

const base = {
  companyId: "c1",
  channelId: "ch1",
  conversationId: "cv1",
  contactId: "ct1",
  isNewContact: true,
  message: {
    provider_message_id: "m1",
    type: "text",
    body: "oi",
    from_phone: "+5511999999999",
  },
};

describe("welcome flow inbound", () => {
  it("não dispara quando o canal não tem fluxo de boas-vindas", async () => {
    const res = await startWelcomeFlowForNewContact({
      supabase: fakeSupabase({}),
      ...base,
      welcomeFlowId: null,
    });
    expect(res).toEqual({ started: false, reason: "no_welcome_flow" });
  });

  it("não dispara quando já existe run em aberto na conversa", async () => {
    const res = await startWelcomeFlowForNewContact({
      supabase: fakeSupabase({ flow_runs: [{ id: "run-open" }] }),
      ...base,
      welcomeFlowId: "f1",
    });
    expect(res.started).toBe(false);
    expect(res.reason).toBe("run_in_progress");
  });

  it("é idempotente por conversa", async () => {
    const res = await startWelcomeFlowForNewContact({
      supabase: fakeSupabase({ flow_runs: [null, { id: "run-prev" }] }),
      ...base,
      welcomeFlowId: "f1",
    });
    expect(res).toEqual({ started: false, runId: "run-prev", reason: "already_started" });
  });

  it("não dispara fluxo inativo ou de outra empresa", async () => {
    const inactive = await startWelcomeFlowForNewContact({
      supabase: fakeSupabase({ flows: { id: "f1", company_id: "c1", status: "draft" } }),
      ...base,
      welcomeFlowId: "f1",
    });
    expect(inactive.reason).toBe("flow_unavailable");

    const foreign = await startWelcomeFlowForNewContact({
      supabase: fakeSupabase({ flows: { id: "f1", company_id: "outra", status: "active" } }),
      ...base,
      welcomeFlowId: "f1",
    });
    expect(foreign.reason).toBe("flow_unavailable");
  });

  it("dispara o fluxo para contato novo com chave idempotente por conversa", async () => {
    let received: Record<string, unknown> | null = null;
    const res = await startWelcomeFlowForNewContact({
      supabase: fakeSupabase({ flows: { id: "f1", company_id: "c1", status: "active" } }),
      ...base,
      welcomeFlowId: "f1",
      createAndExecuteRun: async (input) => {
        received = input as unknown as Record<string, unknown>;
        return { runId: "run-new" };
      },
    });
    expect(res).toEqual({ started: true, runId: "run-new" });
    expect(received!["idempotencyKey"]).toBe("welcome:cv1");
    expect(received!["triggerType"]).toBe("new_contact");
    expect(received!["flowId"]).toBe("f1");
  });

  it("ignora contato existente com histórico na conversa", async () => {
    const res = await startWelcomeFlowForNewContact({
      supabase: fakeSupabase({ messagesCount: 5 }),
      ...base,
      isNewContact: false,
      welcomeFlowId: "f1",
    });
    expect(res.reason).toBe("not_new_contact");
  });

  it("falha do executor não lança para o webhook", async () => {
    const res = await startWelcomeFlowForNewContact({
      supabase: fakeSupabase({ flows: { id: "f1", company_id: "c1", status: "active" } }),
      ...base,
      welcomeFlowId: "f1",
      createAndExecuteRun: async () => {
        throw new Error("sem versão publicada");
      },
    });
    expect(res.started).toBe(false);
    expect(res.reason).toBe("executor_failed");
    expect(res.error).toContain("sem versão publicada");
  });
});
