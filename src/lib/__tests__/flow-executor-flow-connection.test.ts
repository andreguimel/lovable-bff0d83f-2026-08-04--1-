/**
 * FB-10.4C — Validação do bloco Conexão de Fluxo (executor).
 *
 * Cobre os guardas de segurança e roteamento sem tocar em rede:
 *   - Auto-referência é rejeitada.
 *   - Ciclo direto (destino já na cadeia) é rejeitado.
 *   - Profundidade máxima é respeitada.
 *   - Multi-tenant: fluxo de outra empresa é rejeitado.
 *   - Fluxo arquivado é rejeitado.
 *   - Configuração ausente resulta em `skipped`.
 *   - dryRun retorna `ok` sem criar child run.
 *
 * O caminho feliz completo (spawn de child run) é validado em integração
 * via o pipeline canônico `createAndExecuteRun`, coberto pelos testes de
 * runtime existentes — aqui isolamos as pré-condições que só o bloco
 * decide.
 */
import { describe, it, expect } from "bun:test";

const { getPlugin } = await import("../flow-executor.server");

type Row = Record<string, unknown>;

function makeMock(flows: Row[]) {
  return {
    from(name: string) {
      if (name !== "flows") throw new Error(`Tabela mock não suportada: ${name}`);
      const filters: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {
        select(_c?: string) {
          return chain;
        },
        eq(c: string, v: unknown) {
          filters.push([c, v]);
          return chain;
        },
        async maybeSingle() {
          const found = flows.find((r) => filters.every(([c, v]) => r[c] === v));
          return { data: found ?? null, error: null };
        },
      };
      return chain;
    },
  } as never;
}

function makeCtx(overrides: {
  runId?: string;
  flowId?: string;
  companyId?: string;
  variables?: Record<string, unknown>;
  supabase: unknown;
  dryRun?: boolean;
}) {
  const emitted: Array<{ event: string; payload?: Record<string, unknown> }> = [];
  return {
    ctx: {
      runId: overrides.runId ?? "run-1",
      companyId: overrides.companyId ?? "co-A",
      flowId: overrides.flowId ?? "flow-src",
      supabase: overrides.supabase as never,
      conversation: { id: "conv-1", channelId: "ch-1", contactId: "contact-1" },
      channel: null,
      contact: { id: "contact-1", name: "X", phone: "+5511" },
      variables: overrides.variables ?? {},
      history: [],
      dryRun: overrides.dryRun ?? false,
      emit: async (event: string, payload?: Record<string, unknown>) => {
        emitted.push({ event, payload });
      },
    },
    emitted,
  };
}

describe("FB-10.4C · flow_connection executor", () => {
  const plugin = getPlugin("flow_connection");
  it("está registrado no NODE_PLUGINS", () => {
    expect(plugin).not.toBeNull();
  });

  it("skipped quando target_flow_id vazio", async () => {
    const { ctx } = makeCtx({ supabase: makeMock([]) });
    const r = await plugin!.execute(
      { id: "n1", node_type: "flow_connection", data: { target_flow_id: "" } },
      ctx as never,
    );
    expect(r.status).toBe("skipped");
  });

  it("bloqueia autorreferência", async () => {
    const { ctx } = makeCtx({ supabase: makeMock([]) });
    const r = await plugin!.execute(
      { id: "n1", node_type: "flow_connection", data: { target_flow_id: "flow-src" } },
      ctx as never,
    );
    expect(r.status).toBe("failed");
    expect(String(r.message)).toContain("a si mesmo");
  });

  it("bloqueia ciclo (destino já na cadeia de execução)", async () => {
    const { ctx } = makeCtx({
      supabase: makeMock([]),
      variables: { __flow_connection_stack: ["flow-src", "flow-B"] },
    });
    const r = await plugin!.execute(
      { id: "n1", node_type: "flow_connection", data: { target_flow_id: "flow-B" } },
      ctx as never,
    );
    expect(r.status).toBe("failed");
    expect(String(r.message)).toContain("Ciclo detectado");
  });

  it("bloqueia quando limite de profundidade é atingido", async () => {
    const { ctx } = makeCtx({
      supabase: makeMock([]),
      variables: {
        __flow_connection_stack: ["f1", "f2", "f3", "f4", "f5"],
      },
    });
    const r = await plugin!.execute(
      { id: "n1", node_type: "flow_connection", data: { target_flow_id: "flow-Z" } },
      ctx as never,
    );
    expect(r.status).toBe("failed");
    expect(String(r.message)).toContain("encadeamento");
  });

  it("bloqueia fluxo de outra empresa (multi-tenant)", async () => {
    // Empresa A pede fluxo que pertence a B — a query com .eq(company_id, A) não retorna nada.
    const supabase = makeMock([
      { id: "flow-B", company_id: "co-B", status: "active", name: "Outro tenant" },
    ]);
    const { ctx } = makeCtx({ supabase });
    const r = await plugin!.execute(
      { id: "n1", node_type: "flow_connection", data: { target_flow_id: "flow-B" } },
      ctx as never,
    );
    expect(r.status).toBe("failed");
    expect(String(r.message)).toMatch(/outra empresa|inválido/i);
  });

  it("bloqueia fluxo arquivado", async () => {
    const supabase = makeMock([
      { id: "flow-B", company_id: "co-A", status: "archived", name: "Antigo" },
    ]);
    const { ctx } = makeCtx({ supabase });
    const r = await plugin!.execute(
      { id: "n1", node_type: "flow_connection", data: { target_flow_id: "flow-B" } },
      ctx as never,
    );
    expect(r.status).toBe("failed");
    expect(String(r.message)).toContain("arquivado");
  });

  it("dryRun devolve ok sem criar child run", async () => {
    const supabase = makeMock([
      { id: "flow-B", company_id: "co-A", status: "active", name: "Follow-up" },
    ]);
    const { ctx } = makeCtx({ supabase, dryRun: true });
    const r = await plugin!.execute(
      { id: "n1", node_type: "flow_connection", data: { target_flow_id: "flow-B" } },
      ctx as never,
    );
    expect(r.status).toBe("ok");
    expect((r.output as { dry_run?: boolean }).dry_run).toBe(true);
    expect((r.output as { target_flow_name?: string }).target_flow_name).toBe("Follow-up");
  });
});
