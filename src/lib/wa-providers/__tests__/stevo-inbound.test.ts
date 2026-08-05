import { describe, expect, it } from "vitest";

import { normalizeStevoWebhook } from "../stevo-inbound.server";

describe("normalizeStevoWebhook", () => {
  it("normalizes Evolution/Stevo messages.upsert payloads whose event is a string", () => {
    const result = normalizeStevoWebhook({
      event: "messages.upsert",
      instance: "instance-1",
      data: {
        key: {
          id: "3EB0ABC123",
          remoteJid: "5581996919895@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Cliente real",
        message: {
          conversation: "Mensagem recebida pela Stevo",
        },
      },
    });

    expect(result.inbound).toEqual([
      expect.objectContaining({
        provider_message_id: "3EB0ABC123",
        from_phone: "5581996919895",
        contact_name: "Cliente real",
        type: "text",
        body: "Mensagem recebida pela Stevo",
      }),
    ]);
  });

  it("preserves the existing object-shaped event payload", () => {
    const result = normalizeStevoWebhook({
      type: "Message",
      event: {
        Info: {
          ID: "LEGACY-1",
          Chat: "5511999999999@s.whatsapp.net",
          PushName: "Formato legado",
        },
        Message: { conversation: "Olá" },
      },
    });

    expect(result.inbound[0]).toEqual(
      expect.objectContaining({
        provider_message_id: "LEGACY-1",
        body: "Olá",
      }),
    );
  });

  it("normalizes flat payload structures", () => {
    const result = normalizeStevoWebhook({
      type: "message",
      data: {
        id: "FLAT-1",
        from: "5511988887777@s.whatsapp.net",
        pushName: "Cliente Flat",
        body: "Mensagem em formato plano",
        fromMe: false,
      },
    });

    expect(result.inbound).toEqual([
      expect.objectContaining({
        provider_message_id: "FLAT-1",
        from_phone: "5511988887777",
        contact_name: "Cliente Flat",
        type: "text",
        body: "Mensagem em formato plano",
      }),
    ]);
  });

  it("normalizes array data payloads from messages.upsert", () => {
    const result = normalizeStevoWebhook({
      event: "messages.upsert",
      data: [
        {
          key: {
            id: "ARR-1",
            remoteJid: "5511977776666@s.whatsapp.net",
            fromMe: false,
          },
          pushName: "Cliente Array",
          message: {
            conversation: "Mensagem dentro de array data",
          },
        },
      ],
    });

    expect(result.inbound).toEqual([
      expect.objectContaining({
        provider_message_id: "ARR-1",
        from_phone: "5511977776666",
        contact_name: "Cliente Array",
        type: "text",
        body: "Mensagem dentro de array data",
      }),
    ]);
  });
});