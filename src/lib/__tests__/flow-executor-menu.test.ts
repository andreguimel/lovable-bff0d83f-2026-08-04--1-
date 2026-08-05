/**
 * FB-10.4A — Validação E2E interna do bloco Menu.
 *
 * Cobre os cenários A..E do gate de aceite + isolamento entre dois
 * blocos Menu consecutivos no mesmo run (variables.__menu não colide).
 *
 * Usa apenas o executor real (`getPlugin("menu")`) com mocks de
 * Supabase e provider WhatsApp — não toca em rede real.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";

const dispatchSendMock = mock(async () => ({
  ok: true as const,
  provider: "whatsapp_cloud",
  provider_message_id: "wamid.MENU",
  http_status: 200,
  request: {},
  response: {},
}));

mock.module("@/lib/wa-providers/index.server", () => ({
  dispatchSend: dispatchSendMock,
}));

const { getPlugin } = await import("../flow-executor.server");

type Row = Record<string, unknown>;
function makeSupabaseMock() {
  const inserted: Row[] = [];
  const client = {
    from() {
      return {
        insert(row: Row) {
          inserted.push(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: `msg-${inserted.length}` }, error: null }),
            }),
          };
        },
        update() {
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
  return { client, inserted };
}

const menu = () => {
  const p = getPlugin("menu");
  if (!p) throw new Error("menu plugin not registered");
  return p;
};

const menuNode = (id = "m1") => ({
  id,
  node_type: "menu",
  data: {
    body: "Como podemos ajudar?",
    options: [
      { id: "opt_a", label: "Atendimento" },
      { id: "opt_b", label: "Boleto" },
      { id: "opt_c", label: "Cancelamento" },
    ],
    max_attempts: 2,
    invalid_message: "Escolha 1, 2 ou 3.",
  },
});

const baseCtx = (supabase: unknown, variables: Record<string, unknown> = {}) => ({
  runId: "run-1",
  companyId: "co-1",
  supabase,
  channel: { id: "ch-1", provider_type: "whatsapp_cloud", credentials: {}, phone_number: "+5511" },
  contact: { id: "ct-1", phone: "5511999999999" },
  conversation: { id: "conv-1" },
  variables,
  dryRun: false,
});

describe("FB-10.4A — Menu executor E2E", () => {
  beforeEach(() => dispatchSendMock.mockClear());

  it("A. primeira entrada envia prompt numerado e pausa em WAITING_REPLY", async () => {
    const sb = makeSupabaseMock();
    const ctx = baseCtx(sb.client);
    const res = await menu().execute(menuNode() as never, ctx as never);
    expect(res.status).toBe("ok");
    expect(res.wait?.state).toBe("WAITING_REPLY");
    expect(res.vars?.__menu).toEqual({ nodeId: "m1", attempts: 0 });
    expect(dispatchSendMock).toHaveBeenCalledTimes(1);
    const call = dispatchSendMock.mock.calls[0][1] as { body: string };
    expect(call.body).toContain("Como podemos ajudar?");
    expect(call.body).toContain("1) Atendimento");
    expect(call.body).toContain("2) Boleto");
    expect(call.body).toContain("3) Cancelamento");
  });

  it("A. resposta numérica '1' → nextHandle = opt_a", async () => {
    const sb = makeSupabaseMock();
    const ctx = baseCtx(sb.client, {
      __menu: { nodeId: "m1", attempts: 0 },
      reply: { body: "1", type: "text" },
    });
    const res = await menu().execute(menuNode() as never, ctx as never);
    expect(res.status).toBe("ok");
    expect(res.nextHandle).toBe("opt_a");
    expect(res.vars?.__menu).toBe(null);
    expect(res.vars?.reply).toBe(null);
    expect((res.vars as { menu_choice_id?: string }).menu_choice_id).toBe("opt_a");
  });

  it("B. resposta pelo texto exato (case-insensitive) → nextHandle correto", async () => {
    const sb = makeSupabaseMock();
    const ctx = baseCtx(sb.client, {
      __menu: { nodeId: "m1", attempts: 0 },
      reply: { body: "boleto", type: "text" },
    });
    const res = await menu().execute(menuNode() as never, ctx as never);
    expect(res.nextHandle).toBe("opt_b");
  });

  it("C. resposta inválida incrementa attempts, reenvia invalid_message e permanece WAITING_REPLY", async () => {
    const sb = makeSupabaseMock();
    const ctx = baseCtx(sb.client, {
      __menu: { nodeId: "m1", attempts: 0 },
      reply: { body: "xpto", type: "text" },
    });
    const res = await menu().execute(menuNode() as never, ctx as never);
    expect(res.wait?.state).toBe("WAITING_REPLY");
    expect(res.vars?.__menu).toEqual({ nodeId: "m1", attempts: 1 });
    expect(dispatchSendMock).toHaveBeenCalledTimes(1);
    const call = dispatchSendMock.mock.calls[0][1] as { body: string };
    expect(call.body).toBe("Escolha 1, 2 ou 3.");
  });

  it("D. resposta válida após uma inválida retoma no mesmo run e segue a opção correta", async () => {
    const sb = makeSupabaseMock();
    const ctx = baseCtx(sb.client, {
      __menu: { nodeId: "m1", attempts: 1 },
      reply: { body: "3", type: "text" },
    });
    const res = await menu().execute(menuNode() as never, ctx as never);
    expect(res.nextHandle).toBe("opt_c");
    expect(res.vars?.__menu).toBe(null);
  });

  it("E. atinge max_attempts → segue pelo handle 'invalid'", async () => {
    const sb = makeSupabaseMock();
    // max_attempts=2, já em attempts=1, próxima inválida → sai por invalid.
    const ctx = baseCtx(sb.client, {
      __menu: { nodeId: "m1", attempts: 1 },
      reply: { body: "??", type: "text" },
    });
    const res = await menu().execute(menuNode() as never, ctx as never);
    expect(res.nextHandle).toBe("invalid");
    expect(res.vars?.__menu).toBe(null);
    expect(res.wait).toBeUndefined();
  });

  it("aceita reply como string bruta (compat com resumes sintéticos)", async () => {
    const sb = makeSupabaseMock();
    const ctx = baseCtx(sb.client, {
      __menu: { nodeId: "m1", attempts: 0 },
      reply: "2",
    });
    const res = await menu().execute(menuNode() as never, ctx as never);
    expect(res.nextHandle).toBe("opt_b");
  });

  it("dois Menus sequenciais no mesmo run — __menu não colide entre m1 e m2", async () => {
    const sb = makeSupabaseMock();
    const m1 = menuNode("m1");
    const m2 = { ...menuNode("m2"), data: { ...menuNode("m2").data, body: "Segunda pergunta?" } };

    // Passo 1: primeira entrada de m1 (sem reply, sem __menu).
    let variables: Record<string, unknown> = {};
    let res = await menu().execute(m1 as never, baseCtx(sb.client, variables) as never);
    variables = { ...variables, ...(res.vars ?? {}) };
    expect(variables.__menu).toEqual({ nodeId: "m1", attempts: 0 });
    expect(res.wait?.state).toBe("WAITING_REPLY");

    // Passo 2: reply válida para m1 → nextHandle opt_a, __menu limpo.
    variables = { ...variables, reply: { body: "1" } };
    res = await menu().execute(m1 as never, baseCtx(sb.client, variables) as never);
    variables = { ...variables, ...(res.vars ?? {}) };
    expect(res.nextHandle).toBe("opt_a");
    expect(variables.__menu).toBe(null);
    expect(variables.reply).toBe(null);

    // Passo 3: m2 é executado — como __menu está null e reply null,
    // deve ser tratado como primeira entrada (envia prompt de m2, pausa).
    res = await menu().execute(m2 as never, baseCtx(sb.client, variables) as never);
    variables = { ...variables, ...(res.vars ?? {}) };
    expect(res.wait?.state).toBe("WAITING_REPLY");
    expect(variables.__menu).toEqual({ nodeId: "m2", attempts: 0 });

    // Passo 4: reply para m2 → resolve para opt_b sem herdar estado de m1.
    variables = { ...variables, reply: { body: "2" } };
    res = await menu().execute(m2 as never, baseCtx(sb.client, variables) as never);
    expect(res.nextHandle).toBe("opt_b");
    expect(res.vars?.__menu).toBe(null);
  });

  it("guard: __menu com nodeId estranho → tratado como primeira entrada (sem colisão cross-node)", async () => {
    const sb = makeSupabaseMock();
    // Simula variables com __menu de outro node (m0) sobrando por bug.
    const ctx = baseCtx(sb.client, {
      __menu: { nodeId: "m0-legado", attempts: 1 },
      reply: { body: "1" },
    });
    const res = await menu().execute(menuNode("m1") as never, ctx as never);
    // Não confia no state alheio: reenvia prompt e pausa.
    expect(res.wait?.state).toBe("WAITING_REPLY");
    expect(res.vars?.__menu).toEqual({ nodeId: "m1", attempts: 0 });
  });

  it("bloco mal configurado (body vazio / <2 opções) → skipped, sem enviar nada", async () => {
    const sb = makeSupabaseMock();
    const bad = { id: "m1", node_type: "menu", data: { body: "", options: [] } };
    const res = await menu().execute(bad as never, baseCtx(sb.client) as never);
    expect(res.status).toBe("skipped");
    expect(dispatchSendMock).not.toHaveBeenCalled();
  });
});
