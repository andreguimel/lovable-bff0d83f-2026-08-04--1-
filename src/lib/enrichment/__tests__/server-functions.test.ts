/**
 * Enrichment server-functions tests — Phase 3.
 *
 * We exercise the pure helpers `applyApproval` / `applyRejection` with a
 * minimal in-memory fake Supabase client. The `createServerFn` wrappers
 * are thin — they just resolve request-scoped clients and delegate — so
 * covering the helpers covers the business rules.
 */
import { describe, it, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { applyApproval, applyRejection, type SuggestionRow } from "../../enrichment.functions";

type State = {
  suggestion: SuggestionRow | null;
  contactPatches: Array<Record<string, unknown>>;
  suggestionUpdates: Array<Record<string, unknown>>;
  historyInserts: Array<Record<string, unknown>>;
};

function makeSupabase(state: State): SupabaseClient {
  const chain = {
    _table: "",
    _op: "" as "select" | "update" | "insert" | "",
    _payload: undefined as unknown,
    _filters: {} as Record<string, unknown>,
    from(table: string) {
      this._table = table;
      this._op = "";
      this._payload = undefined;
      this._filters = {};
      return this;
    },
    select() {
      this._op = "select";
      return this;
    },
    update(payload: Record<string, unknown>) {
      this._op = "update";
      this._payload = payload;
      return this;
    },
    insert(payload: Record<string, unknown>) {
      this._op = "insert";
      this._payload = payload;
      // history/insert resolves synchronously
      if (this._table === "contact_enrichment_history") {
        state.historyInserts.push(payload);
      }
      return Promise.resolve({ data: null, error: null });
    },
    eq(k: string, v: unknown) {
      this._filters[k] = v;
      return this;
    },
    async maybeSingle<T>() {
      if (this._table === "contact_enrichment_suggestions" && this._op === "select") {
        const s = state.suggestion;
        if (!s || s.id !== this._filters.id) return { data: null, error: null };
        return { data: s as unknown as T, error: null };
      }
      return { data: null, error: null };
    },
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      // update flows land here
      if (this._table === "contacts" && this._op === "update") {
        state.contactPatches.push({ ...(this._payload as object), _filters: { ...this._filters } });
        return resolve({ data: null, error: null });
      }
      if (this._table === "contact_enrichment_suggestions" && this._op === "update") {
        const filterStatus = this._filters.status;
        if (filterStatus && state.suggestion && state.suggestion.status !== filterStatus) {
          return resolve({ data: null, error: null });
        }
        state.suggestionUpdates.push({ ...(this._payload as object) });
        if (state.suggestion) {
          const patch = this._payload as Partial<SuggestionRow>;
          state.suggestion = { ...state.suggestion, ...patch } as SuggestionRow;
        }
        return resolve({ data: null, error: null });
      }
      return resolve({ data: null, error: null });
    },
  };
  // returned proxy so each `.from()` call resets a shared chain (fine for these tests)
  return chain as unknown as SupabaseClient;
}

function baseSuggestion(overrides: Partial<SuggestionRow> = {}): SuggestionRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    company_id: "co-1",
    contact_id: "ct-1",
    run_id: "run-1",
    message_id: "msg-1",
    field_key: "email",
    current_value: null,
    suggested_value: "USER@Example.com",
    confidence: 0.9,
    source_type: "text_message",
    model: "gpt-mini",
    status: "pending",
    reviewed_by: null,
    ...overrides,
  };
}

describe("applyApproval", () => {
  it("normalizes value, patches contact, flips status, records history", async () => {
    const state: State = {
      suggestion: baseSuggestion(),
      contactPatches: [],
      suggestionUpdates: [],
      historyInserts: [],
    };
    const sb = makeSupabase(state);
    const res = await applyApproval(
      { supabase: sb, supabaseAdmin: sb, userId: "u-1", now: () => new Date("2026-07-16T00:00:00Z") },
      { suggestionId: baseSuggestion().id },
    );
    expect(res).toEqual({
      status: "approved",
      alreadyReviewed: false,
      appliedValue: "user@example.com",
    });
    expect(state.contactPatches).toHaveLength(1);
    expect(state.contactPatches[0]).toMatchObject({ email: "user@example.com" });
    expect(state.suggestionUpdates[0]).toMatchObject({
      status: "approved",
      reviewed_by: "u-1",
      review_reason: "approved",
    });
    expect(state.historyInserts).toHaveLength(1);
    expect(state.historyInserts[0]).toMatchObject({
      action: "applied_from_suggestion",
      field_key: "email",
      new_value: "user@example.com",
      actor_id: "u-1",
    });
  });

  it("uses overrideValue and tags review_reason=approved_with_override", async () => {
    const state: State = {
      suggestion: baseSuggestion({ field_key: "name", suggested_value: "joão silva" }),
      contactPatches: [],
      suggestionUpdates: [],
      historyInserts: [],
    };
    const sb = makeSupabase(state);
    const res = await applyApproval(
      { supabase: sb, supabaseAdmin: sb, userId: "u-1" },
      { suggestionId: baseSuggestion().id, overrideValue: "  João  Silva  " },
    );
    expect(res.status).toBe("approved");
    expect(state.contactPatches[0]).toMatchObject({ name: "João Silva" });
    expect(state.suggestionUpdates[0]).toMatchObject({
      review_reason: "approved_with_override",
    });
  });

  it("is idempotent — already-approved suggestion is a no-op", async () => {
    const state: State = {
      suggestion: baseSuggestion({ status: "approved" }),
      contactPatches: [],
      suggestionUpdates: [],
      historyInserts: [],
    };
    const sb = makeSupabase(state);
    const res = await applyApproval(
      { supabase: sb, supabaseAdmin: sb, userId: "u-1" },
      { suggestionId: baseSuggestion().id },
    );
    expect(res).toEqual({ status: "approved", alreadyReviewed: true });
    expect(state.contactPatches).toHaveLength(0);
    expect(state.suggestionUpdates).toHaveLength(0);
    expect(state.historyInserts).toHaveLength(0);
  });

  it("rejects unsupported field", async () => {
    const state: State = {
      suggestion: baseSuggestion({ field_key: "cpf" }),
      contactPatches: [],
      suggestionUpdates: [],
      historyInserts: [],
    };
    const sb = makeSupabase(state);
    await expect(
      applyApproval(
        { supabase: sb, supabaseAdmin: sb, userId: "u-1" },
        { suggestionId: baseSuggestion().id },
      ),
    ).rejects.toThrow(/unsupported_field/);
    expect(state.contactPatches).toHaveLength(0);
    expect(state.historyInserts).toHaveLength(0);
  });

  it("rejects invalid value even from override", async () => {
    const state: State = {
      suggestion: baseSuggestion({ field_key: "email" }),
      contactPatches: [],
      suggestionUpdates: [],
      historyInserts: [],
    };
    const sb = makeSupabase(state);
    await expect(
      applyApproval(
        { supabase: sb, supabaseAdmin: sb, userId: "u-1" },
        { suggestionId: baseSuggestion().id, overrideValue: "not-an-email" },
      ),
    ).rejects.toThrow(/invalid_value:email/);
    expect(state.contactPatches).toHaveLength(0);
  });

  it("throws suggestion_not_found for unknown id", async () => {
    const state: State = {
      suggestion: null,
      contactPatches: [],
      suggestionUpdates: [],
      historyInserts: [],
    };
    const sb = makeSupabase(state);
    await expect(
      applyApproval(
        { supabase: sb, supabaseAdmin: sb, userId: "u-1" },
        { suggestionId: "22222222-2222-2222-2222-222222222222" },
      ),
    ).rejects.toThrow(/suggestion_not_found/);
  });
});

describe("applyRejection", () => {
  it("flips status to rejected and records history without touching contact", async () => {
    const state: State = {
      suggestion: baseSuggestion(),
      contactPatches: [],
      suggestionUpdates: [],
      historyInserts: [],
    };
    const sb = makeSupabase(state);
    const res = await applyRejection(
      { supabase: sb, supabaseAdmin: sb, userId: "u-1" },
      { suggestionId: baseSuggestion().id, reason: "wrong value" },
    );
    expect(res).toEqual({ status: "rejected", alreadyReviewed: false });
    expect(state.contactPatches).toHaveLength(0);
    expect(state.suggestionUpdates[0]).toMatchObject({
      status: "rejected",
      review_reason: "wrong value",
      reviewed_by: "u-1",
    });
    expect(state.historyInserts[0]).toMatchObject({
      action: "rejected",
      field_key: "email",
      actor_id: "u-1",
    });
  });

  it("is idempotent — already-rejected suggestion is a no-op", async () => {
    const state: State = {
      suggestion: baseSuggestion({ status: "rejected" }),
      contactPatches: [],
      suggestionUpdates: [],
      historyInserts: [],
    };
    const sb = makeSupabase(state);
    const res = await applyRejection(
      { supabase: sb, supabaseAdmin: sb, userId: "u-1" },
      { suggestionId: baseSuggestion().id },
    );
    expect(res).toEqual({ status: "rejected", alreadyReviewed: true });
    expect(state.suggestionUpdates).toHaveLength(0);
    expect(state.historyInserts).toHaveLength(0);
  });
});
