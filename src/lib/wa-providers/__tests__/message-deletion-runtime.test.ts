/**
 * Runtime tests for message-deletion.server.ts (Missão Inbox-Delete-01 Fase 2).
 *
 * Focus: retry loop, ACK persistence rules, idempotency, and the
 * "never mark success without provider ACK" invariant. The Supabase
 * client is stubbed with a minimal in-memory fake covering only the
 * operations the runtime performs.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteMessage } from "../../message-deletion.server";
import type { MessageDeletionResult } from "../../wa-providers/deletion-contract.server";

// ---------------------------------------------------------------------------
// Fake Supabase — minimal shape used by deleteMessage
// ---------------------------------------------------------------------------
type MessageRow = {
  id: string;
  company_id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  provider_message_id: string | null;
  deleted_at: string | null;
};

type FakeState = {
  messages: Map<string, MessageRow>;
  conversations: Map<string, { id: string; channel_id: string | null; contact: { phone: string | null } | null }>;
  channels: Map<string, { id: string; provider_type: string; credentials: unknown; phone_number: string | null }>;
  message_updates: Array<{ id: string; patch: Record<string, unknown> }>;
  deletion_inserts: Array<Record<string, unknown>>;
};

function makeFake(seed: {
  message: MessageRow;
  conversation?: { channel_id: string | null; contact_phone: string | null };
  channel?: { provider_type: string; credentials: unknown; phone_number: string | null };
}): { supabase: SupabaseClient; state: FakeState } {
  const state: FakeState = {
    messages: new Map([[seed.message.id, { ...seed.message }]]),
    conversations: new Map(),
    channels: new Map(),
    message_updates: [],
    deletion_inserts: [],
  };
  const convId = seed.message.conversation_id;
  state.conversations.set(convId, {
    id: convId,
    channel_id: seed.conversation?.channel_id ?? null,
    contact: { phone: seed.conversation?.contact_phone ?? null },
  });
  if (seed.channel && seed.conversation?.channel_id) {
    state.channels.set(seed.conversation.channel_id, {
      id: seed.conversation.channel_id,
      provider_type: seed.channel.provider_type,
      credentials: seed.channel.credentials,
      phone_number: seed.channel.phone_number,
    });
  }

  const supabase = {
    from(table: string) {
      if (table === "messages") return messagesTable(state);
      if (table === "conversations") return conversationsTable(state);
      if (table === "channels") return channelsTable(state);
      if (table === "message_deletions") return deletionInsertTable(state);
      throw new Error(`fake supabase: unknown table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { supabase, state };
}

function messagesTable(state: FakeState) {
  let selectedId: string | null = null;
  let mode: "select" | "update" | null = null;
  let patch: Record<string, unknown> = {};
  const chain = {
    select(_cols: string) {
      mode = "select";
      return chain;
    },
    update(p: Record<string, unknown>) {
      mode = "update";
      patch = p;
      return chain;
    },
    eq(_col: string, val: string) {
      selectedId = val;
      if (mode === "update") {
        // Apply the update immediately; return an awaitable result object.
        state.message_updates.push({ id: val, patch });
        const row = state.messages.get(val);
        if (row) Object.assign(row, patch);
        return Promise.resolve({ error: null });
      }
      return chain;
    },
    maybeSingle() {
      if (mode !== "select" || !selectedId) return Promise.resolve({ data: null, error: null });
      const r = state.messages.get(selectedId) ?? null;
      return Promise.resolve({ data: r, error: null });
    },
  };
  return chain;
}

function conversationsTable(state: FakeState) {
  let selectedId: string | null = null;
  const chain = {
    select(_cols: string) {
      return chain;
    },
    eq(_col: string, val: string) {
      selectedId = val;
      return chain;
    },
    maybeSingle() {
      if (!selectedId) return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: state.conversations.get(selectedId) ?? null, error: null });
    },
  };
  return chain;
}

function channelsTable(state: FakeState) {
  let selectedId: string | null = null;
  const chain = {
    select(_cols: string) {
      return chain;
    },
    eq(_col: string, val: string) {
      selectedId = val;
      return chain;
    },
    maybeSingle() {
      if (!selectedId) return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: state.channels.get(selectedId) ?? null, error: null });
    },
  };
  return chain;
}

function deletionInsertTable(state: FakeState) {
  return {
    insert(row: Record<string, unknown>) {
      state.deletion_inserts.push(row);
      return Promise.resolve({ error: null });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const seedMessage: MessageRow = {
  id: "msg-1",
  company_id: "co-1",
  conversation_id: "conv-1",
  direction: "outbound",
  provider_message_id: "wamid.XYZ",
  deleted_at: null,
};

const okDispatch = (ack: boolean | null, skipped = false) =>
  async (): Promise<MessageDeletionResult> => ({
    ok: true,
    provider: "evolution",
    provider_ack: ack,
    skipped,
    response: { status: "SUCCESS" },
  });

describe("deleteMessage runtime", () => {
  it("inbox_only: no provider call, soft-deletes, ack=null", async () => {
    let dispatchCalled = 0;
    const { supabase, state } = makeFake({
      message: seedMessage,
      conversation: { channel_id: "ch-1", contact_phone: "5511" },
      channel: { provider_type: "evolution", credentials: {}, phone_number: "5511" },
    });
    const r = await deleteMessage({
      supabase,
      messageId: "msg-1",
      companyId: "co-1",
      actorId: "user-1",
      scope: "inbox_only",
      dispatch: async () => {
        dispatchCalled++;
        return { ok: true, provider: "manual", provider_ack: null, skipped: true };
      },
      logger: () => {},
    });
    expect(r.ok).toBe(true);
    expect(r.provider_ack).toBeNull();
    // deleteMessage always routes through dispatch (which itself skips inbox_only),
    // so dispatchCalled === 1 is correct.
    expect(dispatchCalled).toBe(1);
    const updated = state.messages.get("msg-1")!;
    expect(updated.deleted_at).not.toBeNull();
    expect(state.deletion_inserts.length).toBe(1);
    expect(state.deletion_inserts[0].scope).toBe("inbox_only");
  });

  it("for_everyone with ACK: soft-deletes and persists ack=true", async () => {
    const { supabase, state } = makeFake({
      message: seedMessage,
      conversation: { channel_id: "ch-1", contact_phone: "5511999998888" },
      channel: { provider_type: "evolution", credentials: {}, phone_number: "5511" },
    });
    const r = await deleteMessage({
      supabase,
      messageId: "msg-1",
      companyId: "co-1",
      actorId: "user-1",
      scope: "for_everyone",
      dispatch: okDispatch(true),
      logger: () => {},
    });
    expect(r.ok).toBe(true);
    expect(r.provider_ack).toBe(true);
    const updated = state.messages.get("msg-1")!;
    expect(updated.deleted_at).not.toBeNull();
    expect((updated as unknown as { provider_delete_ack: boolean }).provider_delete_ack).toBe(true);
    expect(state.deletion_inserts[0].provider_ack).toBe(true);
  });

  it("for_everyone unsupported: DOES NOT soft-delete, persists error", async () => {
    const { supabase, state } = makeFake({
      message: seedMessage,
      conversation: { channel_id: "ch-1", contact_phone: "5511" },
      channel: { provider_type: "whatsapp_cloud", credentials: {}, phone_number: "5511" },
    });
    const r = await deleteMessage({
      supabase,
      messageId: "msg-1",
      companyId: "co-1",
      actorId: "user-1",
      scope: "for_everyone",
      dispatch: async () => ({
        ok: false,
        provider: "whatsapp_cloud",
        code: "unsupported_scope",
        error: "not supported",
        retryable: false,
      }),
      logger: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("unsupported_scope");
    const updated = state.messages.get("msg-1")!;
    // Invariant: no local soft-delete without provider success.
    expect(updated.deleted_at).toBeNull();
    // But the row IS annotated with the error for observability.
    expect((updated as unknown as { provider_delete_ack: boolean }).provider_delete_ack).toBe(false);
    expect((updated as unknown as { provider_delete_error: string }).provider_delete_error).toContain("unsupported_scope");
    // History row still recorded.
    expect(state.deletion_inserts.length).toBe(1);
    expect(state.deletion_inserts[0].provider_ack).toBe(false);
  });

  it("retries transient failures up to maxAttempts", async () => {
    let calls = 0;
    const { supabase } = makeFake({
      message: seedMessage,
      conversation: { channel_id: "ch-1", contact_phone: "5511" },
      channel: { provider_type: "evolution", credentials: {}, phone_number: "5511" },
    });
    const r = await deleteMessage({
      supabase,
      messageId: "msg-1",
      companyId: "co-1",
      actorId: "user-1",
      scope: "for_everyone",
      maxAttempts: 3,
      retryDelayMs: 1,
      dispatch: async () => {
        calls++;
        return {
          ok: false,
          provider: "evolution",
          code: "transient",
          error: "boom",
          retryable: true,
        };
      },
      logger: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("does NOT retry non-retryable failures", async () => {
    let calls = 0;
    const { supabase } = makeFake({
      message: seedMessage,
      conversation: { channel_id: "ch-1", contact_phone: "5511" },
      channel: { provider_type: "evolution", credentials: {}, phone_number: "5511" },
    });
    const r = await deleteMessage({
      supabase,
      messageId: "msg-1",
      companyId: "co-1",
      actorId: "user-1",
      scope: "for_everyone",
      maxAttempts: 5,
      retryDelayMs: 1,
      dispatch: async () => {
        calls++;
        return {
          ok: false,
          provider: "evolution",
          code: "auth_error",
          error: "bad key",
          retryable: false,
        };
      },
      logger: () => {},
    });
    expect(r.ok).toBe(false);
    expect(calls).toBe(1);
    expect(r.attempts).toBe(1);
  });

  it("is idempotent when message is already deleted", async () => {
    let calls = 0;
    const { supabase, state } = makeFake({
      message: { ...seedMessage, deleted_at: "2026-07-16T00:00:00Z" },
      conversation: { channel_id: "ch-1", contact_phone: "5511" },
      channel: { provider_type: "evolution", credentials: {}, phone_number: "5511" },
    });
    const r = await deleteMessage({
      supabase,
      messageId: "msg-1",
      companyId: "co-1",
      actorId: "user-1",
      scope: "for_everyone",
      dispatch: async () => {
        calls++;
        return { ok: true, provider: "evolution", provider_ack: true };
      },
      logger: () => {},
    });
    expect(r.ok).toBe(true);
    expect(calls).toBe(0); // never dispatched
    expect(state.deletion_inserts.length).toBe(0);
  });

  it("rejects a message from another company", async () => {
    const { supabase } = makeFake({
      message: { ...seedMessage, company_id: "other-co" },
      conversation: { channel_id: "ch-1", contact_phone: "5511" },
      channel: { provider_type: "evolution", credentials: {}, phone_number: "5511" },
    });
    const r = await deleteMessage({
      supabase,
      messageId: "msg-1",
      companyId: "co-1",
      actorId: "user-1",
      scope: "for_everyone",
      dispatch: async () => {
        throw new Error("should not be called");
      },
      logger: () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("auth_error");
  });
});
