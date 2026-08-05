/**
 * R2-H-05 — persistência de `messages.provider_message_id` em outbound
 * do Flow Executor. Testa `messageNode` e `mediaNode` isoladamente com
 * um mock de Supabase, verificando que:
 *   - o INSERT captura o id via `.select("id").single()`;
 *   - após `dispatchSend` retornar `provider_message_id`, um UPDATE
 *     escreve esse valor na linha `messages`.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock the provider dispatcher BEFORE importing the executor.
const dispatchSendMock = mock(async (_channel: unknown, _payload: unknown) => ({
  ok: true as const,
  provider: "whatsapp_cloud",
  provider_message_id: "wamid.TEST123",
  http_status: 200,
  request: {},
  response: {},
}));

mock.module("@/lib/wa-providers/index.server", () => ({
  dispatchSend: dispatchSendMock,
}));

const { getPlugin } = await import("../flow-executor.server");
const runNode = async (node: unknown, ctx: unknown) => {
  const plugin = getPlugin((node as { node_type: string }).node_type);
  if (!plugin) throw new Error(`no plugin for ${(node as { node_type: string }).node_type}`);
  return plugin.execute(node as never, ctx as never);
};

type Row = Record<string, unknown>;

function makeSupabaseMock() {
  const inserted: Row[] = [];
  const updated: Array<{ id: string; patch: Row }> = [];
  const client = {
    from(_table: string) {
      return {
        insert(row: Row) {
          inserted.push(row);
          return {
            select(_cols: string) {
              return {
                single: async () => ({ data: { id: `msg-${inserted.length}` }, error: null }),
              };
            },
          };
        },
        update(patch: Row) {
          return {
            eq: async (_col: string, id: string) => {
              updated.push({ id, patch });
              return { data: null, error: null };
            },
          };
        },
      };
    },
  };
  return { client, inserted, updated };
}

const baseCtx = (supabase: unknown) => ({
  runId: "run-1",
  companyId: "co-1",
  supabase,
  channel: { id: "ch-1", provider_type: "whatsapp_cloud", credentials: {}, phone_number: "+5511" },
  contact: { id: "ct-1", phone: "5511999999999" },
  conversation: { id: "conv-1" },
  variables: {},
  dryRun: false,
});

describe("R2-H-05 — flow executor persists provider_message_id", () => {
  beforeEach(() => {
    dispatchSendMock.mockClear();
  });

  it("message node persists provider_message_id after dispatch", async () => {
    const sb = makeSupabaseMock();
    const node = { id: "n1", node_type: "message", data: { body: "Olá" } };
    const res = await runNode(node as never, baseCtx(sb.client) as never);
    expect(res.status).toBe("ok");
    expect(sb.inserted.length).toBe(1);
    expect(sb.updated.length).toBe(1);
    expect(sb.updated[0].patch.provider_message_id).toBe("wamid.TEST123");
  });

  it("media node persists provider_message_id after dispatch", async () => {
    const sb = makeSupabaseMock();
    const node = {
      id: "n2",
      node_type: "send_image",
      data: { media_url: "https://x/y.jpg", caption: "hi" },
    };
    const res = await runNode(node as never, baseCtx(sb.client) as never);
    expect(res.status).toBe("ok");
    expect(sb.updated.length).toBe(1);
    expect(sb.updated[0].patch.provider_message_id).toBe("wamid.TEST123");
  });

  it("skips UPDATE when provider returns no id", async () => {
    dispatchSendMock.mockImplementationOnce(async () => ({
      ok: true as const,
      provider: "mock",
      provider_message_id: null,
      skipped: true,
    }));
    const sb = makeSupabaseMock();
    const node = { id: "n3", node_type: "message", data: { body: "hey" } };
    await runNode(node as never, baseCtx(sb.client) as never);
    expect(sb.inserted.length).toBe(1);
    expect(sb.updated.length).toBe(0);
  });
});
