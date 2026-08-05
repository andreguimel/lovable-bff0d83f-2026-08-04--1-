/**
 * Enrichment runtime tests — Enrichment-01 Fase 2.
 *
 * Focus: confidence policy end-to-end, invariant (never overwrite a filled
 * field), idempotency by message_id, extractor failure handling,
 * unknown-field logging, and multi-entity dedup by best confidence.
 * The Supabase client is a minimal in-memory fake.
 */
import { describe, it, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichContactFromMessage } from "../runtime.server";
import type {
  EntityExtractor,
  ExtractionInput,
  ExtractionResult,
  ExtractedEntity,
} from "../extractor-contract.server";
import { ExtractorError } from "../extractor-contract.server";

// ---------------------------------------------------------------------------
// Fake Supabase covering only what runtime.server touches.
// ---------------------------------------------------------------------------
type State = {
  contact: Record<string, string | null>;
  runs: Map<string, Record<string, unknown>>;
  runsByMessage: Map<string, string>; // message_id → run_id
  suggestions: Array<Record<string, unknown> & { id: string }>;
  history: Array<Record<string, unknown>>;
  contact_updates: Array<Record<string, unknown>>;
  seq: number;
};

const COMPANY = "00000000-0000-0000-0000-00000000c0c0";
const CONTACT = "00000000-0000-0000-0000-000000000c01";

function makeFake(initialContact: Partial<Record<string, string | null>>): {
  supabase: SupabaseClient;
  state: State;
} {
  const state: State = {
    contact: {
      id: CONTACT,
      name: initialContact.name ?? null,
      email: initialContact.email ?? null,
      phone: initialContact.phone ?? null,
      company_name: initialContact.company_name ?? null,
      job_title: initialContact.job_title ?? null,
    },
    runs: new Map(),
    runsByMessage: new Map(),
    suggestions: [],
    history: [],
    contact_updates: [],
    seq: 0,
  };
  const nextId = () => `id-${++state.seq}`;

  const supabase = {
    from(table: string) {
      if (table === "contacts") return contactsTable(state);
      if (table === "contact_enrichment_runs") return runsTable(state, nextId);
      if (table === "contact_enrichment_suggestions") return suggestionsTable(state, nextId);
      if (table === "contact_enrichment_history") return historyTable(state);
      throw new Error(`fake supabase: unknown table ${table}`);
    },
  } as unknown as SupabaseClient;
  return { supabase, state };
}

function contactsTable(state: State) {
  let mode: "select" | "update" = "select";
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
    eq(_col: string, _val: string) {
      return chain;
    },
    async maybeSingle() {
      if (mode === "select") return { data: { ...state.contact }, error: null };
      return { data: null, error: null };
    },
    // For update chains awaited directly.
    then(resolve: (v: { data: null; error: null }) => void) {
      if (mode === "update") {
        state.contact_updates.push({ ...patch });
        for (const [k, v] of Object.entries(patch)) {
          if (k in state.contact) state.contact[k] = v as string | null;
        }
        resolve({ data: null, error: null });
      } else resolve({ data: null, error: null });
    },
  };
  return chain;
}

function runsTable(state: State, nextId: () => string) {
  let filterMessageId: string | null = null;
  let filterRunId: string | null = null;
  let insertRow: Record<string, unknown> | null = null;
  let updatePatch: Record<string, unknown> | null = null;
  const chain = {
    select(_cols: string) {
      return chain;
    },
    insert(row: Record<string, unknown>) {
      insertRow = row;
      return chain;
    },
    update(p: Record<string, unknown>) {
      updatePatch = p;
      return chain;
    },
    eq(col: string, val: string) {
      if (col === "message_id") filterMessageId = val;
      if (col === "id") filterRunId = val;
      return chain;
    },
    async maybeSingle() {
      if (filterMessageId && state.runsByMessage.has(filterMessageId)) {
        const runId = state.runsByMessage.get(filterMessageId)!;
        const row = state.runs.get(runId)!;
        return { data: { id: runId, status: row.status }, error: null };
      }
      return { data: null, error: null };
    },
    async single() {
      if (insertRow) {
        const id = nextId();
        const row = { id, ...insertRow };
        state.runs.set(id, row);
        state.runsByMessage.set(insertRow.message_id as string, id);
        return { data: { id }, error: null };
      }
      return { data: null, error: null };
    },
    then(resolve: (v: { data: null; error: null }) => void) {
      if (updatePatch && filterRunId) {
        const row = state.runs.get(filterRunId);
        if (row) Object.assign(row, updatePatch);
      }
      resolve({ data: null, error: null });
    },
  };
  return chain;
}

function suggestionsTable(state: State, nextId: () => string) {
  let insertRows: Array<Record<string, unknown>> = [];
  const chain = {
    insert(rows: Array<Record<string, unknown>>) {
      insertRows = rows;
      return chain;
    },
    select(_cols: string) {
      const inserted = insertRows.map((r) => {
        const id = nextId();
        const stored = { id, ...r };
        state.suggestions.push(stored);
        return { id, field_key: r.field_key as string };
      });
      return Promise.resolve({ data: inserted, error: null });
    },
  };
  return chain;
}

function historyTable(state: State) {
  return {
    insert(rows: Array<Record<string, unknown>>) {
      for (const r of rows) state.history.push(r);
      return Promise.resolve({ data: null, error: null });
    },
  };
}

// ---------------------------------------------------------------------------
// Extractor stubs
// ---------------------------------------------------------------------------
function stubExtractor(entities: ExtractedEntity[]): EntityExtractor {
  return {
    async extract(_input: ExtractionInput): Promise<ExtractionResult> {
      return { model: "stub/model-1", latencyMs: 5, tokenUsage: { input: 10, output: 5 }, entities };
    },
  };
}

function failingExtractor(code: "transient" | "provider_error"): EntityExtractor {
  return {
    async extract() {
      throw new ExtractorError(code, `stub ${code}`, code === "transient");
    },
  };
}

function inputFor(messageId: string): Parameters<typeof enrichContactFromMessage>[1] {
  return {
    companyId: COMPANY,
    contactId: CONTACT,
    messageId,
    sourceType: "text_message",
    text: "any text",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("enrichContactFromMessage", () => {
  it("auto-applies to an empty field when confidence >= 0.95", async () => {
    const { supabase, state } = makeFake({ email: null });
    const extractor = stubExtractor([
      { field_key: "email", value: "beatriz@gmail.com", confidence: 0.98 },
    ]);
    const res = await enrichContactFromMessage({ supabase, extractor }, inputFor("m1"));
    expect(res.status).toBe("completed");
    expect(state.contact.email).toBe("beatriz@gmail.com");
    expect(res.outcomes[0].action).toBe("auto_applied");
    expect(state.history).toHaveLength(1);
    expect(state.history[0].action).toBe("auto_applied");
    expect(state.suggestions).toHaveLength(0);
  });

  it("NEVER overwrites a filled field, even with confidence = 1.0 → suggestion instead", async () => {
    const { supabase, state } = makeFake({ email: "old@empresa.com" });
    const extractor = stubExtractor([
      { field_key: "email", value: "new@gmail.com", confidence: 1.0 },
    ]);
    const res = await enrichContactFromMessage({ supabase, extractor }, inputFor("m2"));
    expect(res.status).toBe("completed");
    expect(state.contact.email).toBe("old@empresa.com"); // untouched
    expect(res.outcomes[0].action).toBe("suggested");
    expect(state.suggestions).toHaveLength(1);
    expect(state.suggestions[0].current_value).toBe(JSON.stringify("old@empresa.com"));
    expect(state.suggestions[0].suggested_value).toBe(JSON.stringify("new@gmail.com"));
    expect(state.suggestions[0].status).toBe("pending");
    // History row for the suggestion is linked to the inserted suggestion id.
    const suggested = state.history.find((h) => h.action === "suggested")!;
    expect(suggested.suggestion_id).toBe(state.suggestions[0].id);
  });

  it("suggests on empty field when confidence is medium (>=0.70, <0.95)", async () => {
    const { supabase, state } = makeFake({ phone: null });
    const extractor = stubExtractor([
      { field_key: "phone", value: "11987654321", confidence: 0.8 },
    ]);
    const res = await enrichContactFromMessage({ supabase, extractor }, inputFor("m3"));
    expect(res.status).toBe("completed");
    expect(state.contact.phone).toBeNull();
    expect(res.outcomes[0].action).toBe("suggested");
    expect(state.suggestions).toHaveLength(1);
  });

  it("ignores extractions below the suggest threshold", async () => {
    const { supabase, state } = makeFake({ email: null });
    const extractor = stubExtractor([
      { field_key: "email", value: "x@y.com", confidence: 0.5 },
    ]);
    const res = await enrichContactFromMessage({ supabase, extractor }, inputFor("m4"));
    expect(res.outcomes[0].action).toBe("ignored");
    expect(state.contact.email).toBeNull();
    expect(state.suggestions).toHaveLength(0);
    expect(state.history[0].action).toBe("ignored");
  });

  it("ignores same-value extractions (no-op history entry)", async () => {
    const { supabase, state } = makeFake({ email: "Beatriz@Empresa.com" });
    const extractor = stubExtractor([
      { field_key: "email", value: "beatriz@empresa.com", confidence: 0.99 },
    ]);
    const res = await enrichContactFromMessage({ supabase, extractor }, inputFor("m5"));
    expect(res.outcomes[0].action).toBe("ignored");
    expect(state.contact_updates).toHaveLength(0);
  });

  it("records unknown fields (cpf, cnpj, etc.) as ignored with reason unknown_field", async () => {
    const { supabase, state } = makeFake({});
    const extractor = stubExtractor([
      { field_key: "cpf", value: "123.456.789-00", confidence: 0.99 },
    ]);
    const res = await enrichContactFromMessage({ supabase, extractor }, inputFor("m6"));
    expect(res.outcomes[0].action).toBe("ignored");
    expect(res.outcomes[0].reason).toBe("unknown_field");
    expect(state.history[0].field_key).toBe("cpf");
    expect(state.suggestions).toHaveLength(0);
    expect(state.contact_updates).toHaveLength(0);
  });

  it("keeps the highest-confidence entity when the extractor returns duplicates for the same field", async () => {
    const { supabase, state } = makeFake({ email: null });
    const extractor = stubExtractor([
      { field_key: "email", value: "low@x.com", confidence: 0.72 },
      { field_key: "email", value: "high@x.com", confidence: 0.97 },
    ]);
    const res = await enrichContactFromMessage({ supabase, extractor }, inputFor("m7"));
    expect(res.outcomes).toHaveLength(1);
    expect(state.contact.email).toBe("high@x.com");
  });

  it("is idempotent by message_id: a completed run is not re-executed", async () => {
    const { supabase, state } = makeFake({ email: null });
    const extractor = stubExtractor([
      { field_key: "email", value: "beatriz@gmail.com", confidence: 0.98 },
    ]);
    const first = await enrichContactFromMessage({ supabase, extractor }, inputFor("m8"));
    expect(first.status).toBe("completed");
    const second = await enrichContactFromMessage({ supabase, extractor }, inputFor("m8"));
    expect(second.status).toBe("skipped");
    expect(state.contact_updates).toHaveLength(1); // only the first run wrote
  });

  it("marks the run as failed when the extractor throws, without touching contact", async () => {
    const { supabase, state } = makeFake({ email: null });
    const res = await enrichContactFromMessage(
      { supabase, extractor: failingExtractor("transient") },
      inputFor("m9"),
    );
    expect(res.status).toBe("failed");
    expect(res.error).toBe("transient");
    expect(state.contact.email).toBeNull();
    expect(state.contact_updates).toHaveLength(0);
    expect(state.suggestions).toHaveLength(0);
    expect(state.history).toHaveLength(0);
  });

  it("ignores values that fail field validation (invalid_value reason)", async () => {
    const { supabase, state } = makeFake({ email: null });
    const extractor = stubExtractor([
      { field_key: "email", value: "not-an-email", confidence: 0.99 },
    ]);
    const res = await enrichContactFromMessage({ supabase, extractor }, inputFor("m10"));
    expect(res.outcomes[0].action).toBe("ignored");
    expect(res.outcomes[0].reason).toBe("invalid_value");
    expect(state.contact.email).toBeNull();
  });
});
