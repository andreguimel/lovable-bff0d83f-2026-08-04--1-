/**
 * Regressão crítica — bloco Fazer uma pergunta.
 *
 * Garante o contrato do plugin canônico usado por executeRun:
 * primeira passagem sempre pausa; resposta segue por default; ausência de
 * resposta na retomada por prazo segue por no_reply.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";

const dispatchSendMock = mock(async () => ({
  ok: true as const,
  provider: "whatsapp_cloud",
  provider_message_id: "wamid.QUESTION",
  http_status: 200,
  request: {},
  response: {},
}));

mock.module("@/lib/wa-providers/index.server", () => ({
  dispatchSend: dispatchSendMock,
}));

const { getPlugin, questionTimeoutSeconds } = await import("../flow-executor.server");

function question() {
  const plugin = getPlugin("question");
  if (!plugin) throw new Error("question plugin not registered");
  return plugin;
}

function makeSupabaseMock() {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    inserted,
    client: {
      from() {
        return {
          insert(row: Record<string, unknown>) {
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
    },
  };
}

const node = (data: Record<string, unknown> = {}) => ({
  id: "q1",
  node_type: "question",
  data: {
    body: "Qual é o seu CNPJ?",
    save_as: "cnpj",
    timeout_value: 5,
    timeout_unit: "minutes",
    ...data,
  },
});

const context = (variables: Record<string, unknown> = {}) => ({
  runId: "run-question",
  companyId: "co-1",
  flowId: "flow-1",
  supabase: makeSupabaseMock().client,
  channel: {
    id: "ch-1",
    provider_type: "whatsapp_cloud",
    credentials: {},
    phone_number: "+5511",
  },
  contact: { id: "ct-1", phone: "5511999999999", name: "Cliente" },
  conversation: { id: "conv-1", channelId: "ch-1", contactId: "ct-1" },
  variables,
  history: [],
  dryRun: false,
  emit: async () => {},
});

describe("Fazer uma pergunta — pausa, resposta e expiração", () => {
  beforeEach(() => dispatchSendMock.mockClear());

  it("envia uma vez e obrigatoriamente pausa no próprio nó", async () => {
    const result = await question().execute(node() as never, context() as never);

    expect(result.status).toBe("ok");
    expect(result.wait?.state).toBe("WAITING_REPLY");
    expect(result.wait?.resumeAt).toBeString();
    expect(result.nextHandle).toBeUndefined();
    expect(result.output).toMatchObject({
      question_sent: true,
      paused_for_reply: true,
      timeout_seconds: 300,
    });
    expect(result.vars?.__question).toMatchObject({ nodeId: "q1" });
    expect(dispatchSendMock).toHaveBeenCalledTimes(1);
  });

  it("ao receber resposta não reenvia a pergunta e segue por default", async () => {
    const result = await question().execute(
      node() as never,
      context({
        __question: { nodeId: "q1", askedAt: "2026-08-02T00:00:00.000Z" },
        reply: { body: "12.345.678/0001-90" },
      }) as never,
    );

    expect(result.wait).toBeUndefined();
    expect(result.nextHandle).toBe("default");
    expect(result.vars).toMatchObject({
      __question: null,
      reply: null,
      last_reply: "12.345.678/0001-90",
      cnpj: "12.345.678/0001-90",
    });
    expect(dispatchSendMock).not.toHaveBeenCalled();
  });

  it("na retomada sem resposta segue somente por no_reply", async () => {
    const result = await question().execute(
      node() as never,
      context({
        __question: { nodeId: "q1", askedAt: "2026-08-02T00:00:00.000Z" },
        reply: null,
      }) as never,
    );

    expect(result.wait).toBeUndefined();
    expect(result.nextHandle).toBe("no_reply");
    expect(result.output).toMatchObject({ timed_out: true });
    expect(dispatchSendMock).not.toHaveBeenCalled();
  });

  it("converte corretamente segundos, minutos, horas e dias", () => {
    expect(questionTimeoutSeconds({ timeout_value: 2, timeout_unit: "seconds" })).toBe(2);
    expect(questionTimeoutSeconds({ timeout_value: 2, timeout_unit: "minutes" })).toBe(120);
    expect(questionTimeoutSeconds({ timeout_value: 2, timeout_unit: "hours" })).toBe(7200);
    expect(questionTimeoutSeconds({ timeout_value: 2, timeout_unit: "days" })).toBe(172800);
    expect(questionTimeoutSeconds({ timeout_value: undefined, timeout_unit: "days" })).toBeNull();
  });
});