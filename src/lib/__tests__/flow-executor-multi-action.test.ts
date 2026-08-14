import { describe, it, expect } from "vitest";
import { getPlugin } from "../flow-executor.server";

describe("Multi-Action Block Execution", () => {
  it("executa sub-funções empilhadas em um bloco", async () => {
    const plugin = getPlugin("message");
    expect(plugin).toBeDefined();

    // mock minimum execution context
    const logs: string[] = [];
    const mockCtx = {
      runId: "run-1",
      companyId: "co-1",
      flowId: "flow-1",
      supabase: {} as any,
      conversation: { id: "conv-1", channelId: "ch-1", contactId: "c-1" },
      channel: { id: "ch-1", company_id: "co-1", provider: "zenda_cloud", settings: {} } as any,
      contact: { id: "c-1", name: "João", phone: "5511999999999" },
      variables: {},
      history: [],
      dryRun: true,
      emit: async (event: string, payload?: any) => {
        logs.push(`${event}:${payload?.node_type || ""}`);
      },
    };

    const multiActionNode = {
      id: "node-multi-1",
      node_type: "message",
      data: {
        label: "Bloco Boas-Vindas (BotConversa)",
        actions: [
          { id: "a1", kind: "message", body: "Olá {{contact.name}}!" },
          { id: "a2", kind: "wait", seconds: 2 },
          { id: "a3", kind: "tag", tag: "cliente_novo" },
        ],
      },
    };

    const res = await plugin!.execute(multiActionNode, mockCtx as any);
    expect(res).toBeDefined();
  });

  it("executa bloco de Conteúdo unificado com Texto + Imagem + Arquivo + Áudio", async () => {
    const plugin = getPlugin("message");
    expect(plugin).toBeDefined();

    const mockCtx = {
      runId: "run-content-1",
      companyId: "co-1",
      flowId: "flow-1",
      supabase: {} as any,
      conversation: { id: "conv-1", channelId: "ch-1", contactId: "c-1" },
      channel: { id: "ch-1", company_id: "co-1", provider: "zenda_cloud", settings: {} } as any,
      contact: { id: "c-1", name: "Maria", phone: "5511988888888" },
      variables: {},
      history: [],
      dryRun: true,
      emit: async () => {},
    };

    const unifiedContentNode = {
      id: "node-content-1",
      node_type: "message",
      data: {
        label: "Conteúdo",
        actions: [
          { id: "c1", kind: "message", body: "Olá Maria, veja a proposta abaixo:" },
          { id: "c2", kind: "send_image", media_url: "https://example.com/foto.jpg", media_filename: "foto.jpg" },
          { id: "c3", kind: "send_document", media_url: "https://example.com/proposta.pdf", media_filename: "proposta.pdf" },
          { id: "c4", kind: "send_audio", media_url: "https://example.com/audio.ogg", is_voice: true },
        ],
      },
    };

    const res = await plugin!.execute(unifiedContentNode, mockCtx as any);
    expect(res).toBeDefined();
    expect(res.status).toBe("ok");
  });
});
