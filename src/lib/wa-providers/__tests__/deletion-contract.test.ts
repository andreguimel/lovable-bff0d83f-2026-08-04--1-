/**
 * Provider Contract unit tests — Missão Inbox-Delete-01 Fase 2.
 *
 * These are pure-function tests: no DB, no real network. All fetch calls
 * are stubbed. They validate the contract every adapter must honor:
 *   - inbox_only → skipped, no network call
 *   - for_me / for_everyone matrix per provider
 *   - error classification (auth / not_found / transient / unsupported)
 *   - retryable flag on the standardized codes
 *
 * Run with: `bun test src/lib/wa-providers/__tests__/`
 */
import { describe, it, expect } from "vitest";
import {
  classifyHttpFailure,
  missingCredentials,
  invalidPayload,
  skippedResult,
  unsupportedScope,
  type MessageDeletionRequest,
} from "../deletion-contract.server";
import { whatsappCloudDeletionProvider } from "../whatsapp-cloud-delete.server";
import { createEvolutionDeletionProvider } from "../evolution-delete.server";
import { createBaileysDeletionProvider } from "../baileys-delete.server";

// ---------------------------------------------------------------------------
// fetch stub factory
// ---------------------------------------------------------------------------
type FetchCall = { url: string; init?: RequestInit };
function stubFetch(response: { status: number; body: unknown } | Error) {
  const calls: FetchCall[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (response instanceof Error) throw response;
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}

const baseReq = (overrides: Partial<MessageDeletionRequest> = {}): MessageDeletionRequest => ({
  scope: "for_everyone",
  provider_message_id: "wamid.ABC123",
  peer_phone: "5511999998888",
  from_me: true,
  reason: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// contract helpers
// ---------------------------------------------------------------------------
describe("deletion-contract helpers", () => {
  it("skippedResult marks provider_ack=null and skipped=true", () => {
    const r = skippedResult("test");
    expect(r).toEqual({ ok: true, provider: "test", provider_ack: null, skipped: true });
  });

  it("unsupportedScope is not retryable", () => {
    const r = unsupportedScope("cloud", "for_everyone", "no endpoint");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unsupported_scope");
      expect(r.retryable).toBe(false);
    }
  });

  it("missingCredentials and invalidPayload never retry", () => {
    const a = missingCredentials("evo", "api_key");
    const b = invalidPayload("evo", "no id");
    expect(a.retryable).toBe(false);
    expect(b.retryable).toBe(false);
  });

  it("classifyHttpFailure maps 401/403 to auth_error", () => {
    const r = classifyHttpFailure("p", 401, { error: "bad token" });
    expect(r.code).toBe("auth_error");
    expect(r.retryable).toBe(false);
    expect(r.error).toBe("bad token");
  });

  it("classifyHttpFailure maps 404 to message_not_found", () => {
    const r = classifyHttpFailure("p", 404, { message: "gone" });
    expect(r.code).toBe("message_not_found");
    expect(r.retryable).toBe(false);
  });

  it("classifyHttpFailure maps 429/5xx to transient (retryable)", () => {
    expect(classifyHttpFailure("p", 429, {}).code).toBe("transient");
    expect(classifyHttpFailure("p", 429, {}).retryable).toBe(true);
    expect(classifyHttpFailure("p", 502, {}).retryable).toBe(true);
  });

  it("classifyHttpFailure detects revoke window from message text", () => {
    const r = classifyHttpFailure("p", 400, { error: "revoke window expired for message" });
    expect(r.code).toBe("revoke_window_expired");
    expect(r.retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WhatsApp Cloud
// ---------------------------------------------------------------------------
describe("whatsappCloudDeletionProvider", () => {
  it("skips inbox_only without touching the provider", async () => {
    const r = await whatsappCloudDeletionProvider.delete({}, "5511", baseReq({ scope: "inbox_only" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skipped).toBe(true);
  });

  it("skips for_me (Cloud has no such primitive)", async () => {
    const r = await whatsappCloudDeletionProvider.delete({}, "5511", baseReq({ scope: "for_me" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skipped).toBe(true);
  });

  it("returns unsupported_scope for for_everyone", async () => {
    const r = await whatsappCloudDeletionProvider.delete({}, "5511", baseReq({ scope: "for_everyone" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unsupported_scope");
      expect(r.retryable).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Evolution
// ---------------------------------------------------------------------------
describe("evolutionDeletionProvider", () => {
  const creds = { base_url: "https://evo.example.com", instance: "zenda", api_key: "K" };

  it("skips inbox_only and for_me without HTTP", async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: {} });
    const p = createEvolutionDeletionProvider(fetch);
    const a = await p.delete(creds, "5511999998888", baseReq({ scope: "inbox_only" }));
    const b = await p.delete(creds, "5511999998888", baseReq({ scope: "for_me" }));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(calls.length).toBe(0);
  });

  it("performs DELETE for for_everyone and returns ack=true on 200", async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: { status: "SUCCESS" } });
    const p = createEvolutionDeletionProvider(fetch);
    const r = await p.delete(creds, "5511999998888", baseReq());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider_ack).toBe(true);
      expect(r.provider).toBe("evolution");
    }
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://evo.example.com/chat/deleteMessageForEveryone/zenda");
    expect(calls[0].init?.method).toBe("DELETE");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toEqual({
      id: "wamid.ABC123",
      remoteJid: "5511999998888@s.whatsapp.net",
      fromMe: true,
    });
    expect((calls[0].init?.headers as Record<string, string>).apikey).toBe("K");
  });

  it("returns missing_credentials when creds incomplete", async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: {} });
    const p = createEvolutionDeletionProvider(fetch);
    const r = await p.delete({}, "5511", baseReq());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_credentials");
    expect(calls.length).toBe(0);
  });

  it("returns invalid_payload when provider_message_id missing", async () => {
    const { fetch } = stubFetch({ status: 200, body: {} });
    const p = createEvolutionDeletionProvider(fetch);
    const r = await p.delete(creds, "5511", baseReq({ provider_message_id: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_payload");
  });

  it("classifies 401 as auth_error (not retryable)", async () => {
    const { fetch } = stubFetch({ status: 401, body: { error: "bad key" } });
    const p = createEvolutionDeletionProvider(fetch);
    const r = await p.delete(creds, "5511999998888", baseReq());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("auth_error");
      expect(r.retryable).toBe(false);
    }
  });

  it("classifies 503 as transient (retryable)", async () => {
    const { fetch } = stubFetch({ status: 503, body: {} });
    const p = createEvolutionDeletionProvider(fetch);
    const r = await p.delete(creds, "5511999998888", baseReq());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("transient");
      expect(r.retryable).toBe(true);
    }
  });

  it("wraps network throw as transient/retryable", async () => {
    const { fetch } = stubFetch(new Error("ECONNRESET"));
    const p = createEvolutionDeletionProvider(fetch);
    const r = await p.delete(creds, "5511999998888", baseReq());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("transient");
      expect(r.retryable).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Baileys
// ---------------------------------------------------------------------------
describe("baileysDeletionProvider", () => {
  const creds = { base_url: "https://baileys.example.com", session: "s1", api_key: "K" };

  it("skips inbox_only without HTTP", async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: {} });
    const p = createBaileysDeletionProvider(fetch);
    const r = await p.delete(creds, "5511", baseReq({ scope: "inbox_only" }));
    expect(r.ok).toBe(true);
    expect(calls.length).toBe(0);
  });

  it("performs POST for for_everyone and returns ack=true on 200", async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: { deleted: true } });
    const p = createBaileysDeletionProvider(fetch);
    const r = await p.delete(creds, "5511999998888", baseReq());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider_ack).toBe(true);
    expect(calls[0].url).toBe("https://baileys.example.com/sessions/s1/messages/delete");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>)["x-api-key"]).toBe("K");
  });

  it("hits delete-for-me endpoint for for_me", async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: {} });
    const p = createBaileysDeletionProvider(fetch);
    const r = await p.delete(creds, "5511999998888", baseReq({ scope: "for_me" }));
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe("https://baileys.example.com/sessions/s1/messages/delete-for-me");
  });

  it("normalizes 404 on for_me as unsupported_scope", async () => {
    const { fetch } = stubFetch({ status: 404, body: {} });
    const p = createBaileysDeletionProvider(fetch);
    const r = await p.delete(creds, "5511999998888", baseReq({ scope: "for_me" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unsupported_scope");
      expect(r.retryable).toBe(false);
    }
  });

  it("uses Bearer auth when auth_scheme=bearer", async () => {
    const { fetch, calls } = stubFetch({ status: 200, body: {} });
    const p = createBaileysDeletionProvider(fetch);
    await p.delete({ ...creds, auth_scheme: "bearer" }, "5511999998888", baseReq());
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer K");
  });

  it("wraps network throw as transient/retryable", async () => {
    const { fetch } = stubFetch(new Error("timeout"));
    const p = createBaileysDeletionProvider(fetch);
    const r = await p.delete(creds, "5511999998888", baseReq());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("transient");
      expect(r.retryable).toBe(true);
    }
  });
});
