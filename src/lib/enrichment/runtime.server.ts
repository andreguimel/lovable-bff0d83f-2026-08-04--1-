/**
 * Contact Enrichment Runtime — server-only.
 *
 * enrichContactFromMessage() is the sole orchestrator:
 *   1. Idempotently upserts a `contact_enrichment_runs` row for the message.
 *   2. Loads current contact state, calls the injected EntityExtractor.
 *   3. For each extracted entity, applies the confidence policy and:
 *        - auto-applies to the contacts table (only when field is empty),
 *        - creates a suggestion (any divergent value or medium confidence),
 *        - or ignores (same value / below threshold / unknown field).
 *   4. Records every decision in `contact_enrichment_history` (append-only).
 *   5. Marks the run completed / failed with payload + latency.
 *
 * INVARIANTS
 *   - Never overwrites a non-empty contact field automatically.
 *   - Never writes suggestions/history without a corresponding run row.
 *   - Idempotent per message_id via UNIQUE(message_id) on runs.
 *   - No fetch, no HTTP: extractor and Supabase client are injected.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decideEnrichment, type EnrichmentDecision } from "./confidence";
import { getBuiltInField } from "./field-registry.server";
import type {
  EnrichmentSourceType,
  EntityExtractor,
  ExtractedEntity,
} from "./extractor-contract.server";
import { ExtractorError } from "./extractor-contract.server";

export type EnrichmentRuntimeDeps = {
  supabase: SupabaseClient;
  extractor: EntityExtractor;
  now?: () => Date;
};

export type EnrichmentRuntimeInput = {
  companyId: string;
  contactId: string;
  messageId: string;
  sourceType: EnrichmentSourceType;
  text: string;
};

export type EnrichmentPerFieldOutcome = {
  field_key: string;
  action: "auto_applied" | "suggested" | "ignored";
  reason: string;
  confidence: number;
  previous_value: string | null;
  new_value: string | null;
  suggestion_id?: string;
};

export type EnrichmentRuntimeResult = {
  runId: string;
  status: "completed" | "failed" | "skipped";
  outcomes: EnrichmentPerFieldOutcome[];
  error?: string;
};

function log(payload: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ tag: "contact-enrichment", ...payload }));
  } catch {
    /* logging must never throw */
  }
}

export async function enrichContactFromMessage(
  deps: EnrichmentRuntimeDeps,
  input: EnrichmentRuntimeInput,
): Promise<EnrichmentRuntimeResult> {
  const now = deps.now ?? (() => new Date());

  // 1) Upsert run row (idempotent on message_id).
  const run = await upsertRun(deps.supabase, input, now());
  if (run.alreadyCompleted) {
    log({ event: "run_skipped", run_id: run.id, message_id: input.messageId });
    return { runId: run.id, status: "skipped", outcomes: [] };
  }

  // 2) Load contact snapshot for `known` + current-value comparison.
  const contact = await loadContact(deps.supabase, input.companyId, input.contactId);
  if (!contact) {
    await failRun(deps.supabase, run.id, "contact_not_found", now());
    return { runId: run.id, status: "failed", outcomes: [], error: "contact_not_found" };
  }

  // 3) Extract entities.
  let extracted;
  try {
    extracted = await deps.extractor.extract({
      companyId: input.companyId,
      contactId: input.contactId,
      messageId: input.messageId,
      sourceType: input.sourceType,
      text: input.text,
      known: contact.snapshot,
    });
  } catch (err) {
    const code = err instanceof ExtractorError ? err.code : "provider_error";
    const message = err instanceof Error ? err.message : String(err);
    await failRun(deps.supabase, run.id, `${code}: ${message}`, now());
    log({ event: "extractor_failed", run_id: run.id, code, message });
    return { runId: run.id, status: "failed", outcomes: [], error: code };
  }

  // 4) Apply decisions.
  const outcomes: EnrichmentPerFieldOutcome[] = [];
  const columnPatch: Record<string, string> = {};
  const historyRows: Record<string, unknown>[] = [];
  const suggestionInserts: Record<string, unknown>[] = [];

  for (const entity of dedupeByField(extracted.entities)) {
    const outcome = evaluateEntity({
      entity,
      contact: contact.snapshot,
      runId: run.id,
      input,
      model: extracted.model,
      now: now(),
    });

    outcomes.push({
      field_key: outcome.field_key,
      action: outcome.action,
      reason: outcome.reason,
      confidence: entity.confidence,
      previous_value: outcome.previous_value,
      new_value: outcome.new_value,
    });

    if (outcome.columnPatch) Object.assign(columnPatch, outcome.columnPatch);
    if (outcome.historyRow) historyRows.push(outcome.historyRow);
    if (outcome.suggestionRow) suggestionInserts.push(outcome.suggestionRow);
  }

  // 5) Persist — order matters: contacts patch first, then suggestions
  //    (so their IDs can be linked into history), then history rows.
  if (Object.keys(columnPatch).length > 0) {
    const { error } = await deps.supabase
      .from("contacts")
      .update({ ...columnPatch, updated_at: now().toISOString() })
      .eq("id", input.contactId)
      .eq("company_id", input.companyId);
    if (error) {
      await failRun(deps.supabase, run.id, `contacts_update_failed: ${error.message}`, now());
      return { runId: run.id, status: "failed", outcomes, error: "contacts_update_failed" };
    }
  }

  let insertedSuggestions: { id: string; field_key: string }[] = [];
  if (suggestionInserts.length > 0) {
    const { data, error } = await deps.supabase
      .from("contact_enrichment_suggestions")
      .insert(suggestionInserts)
      .select("id, field_key");
    if (error) {
      await failRun(deps.supabase, run.id, `suggestions_insert_failed: ${error.message}`, now());
      return { runId: run.id, status: "failed", outcomes, error: "suggestions_insert_failed" };
    }
    insertedSuggestions = (data as { id: string; field_key: string }[]) ?? [];
    // Link suggestion IDs into history rows and expose in outcomes.
    for (const suggestion of insertedSuggestions) {
      const historyRow = historyRows.find(
        (h) => h.field_key === suggestion.field_key && h.action === "suggested",
      );
      if (historyRow) historyRow.suggestion_id = suggestion.id;
      const outcome = outcomes.find(
        (o) => o.field_key === suggestion.field_key && o.action === "suggested",
      );
      if (outcome) outcome.suggestion_id = suggestion.id;
    }
  }

  if (historyRows.length > 0) {
    const { error } = await deps.supabase.from("contact_enrichment_history").insert(historyRows);
    if (error) {
      await failRun(deps.supabase, run.id, `history_insert_failed: ${error.message}`, now());
      return { runId: run.id, status: "failed", outcomes, error: "history_insert_failed" };
    }
  }

  // 6) Finalize run.
  const finishedAt = now();
  await deps.supabase
    .from("contact_enrichment_runs")
    .update({
      status: "completed",
      model: extracted.model,
      latency_ms: extracted.latencyMs,
      token_usage: extracted.tokenUsage ?? {},
      extracted_payload: { entities: extracted.entities, outcomes },
      finished_at: finishedAt.toISOString(),
      updated_at: finishedAt.toISOString(),
    })
    .eq("id", run.id);

  log({
    event: "run_completed",
    run_id: run.id,
    message_id: input.messageId,
    contact_id: input.contactId,
    outcomes_count: outcomes.length,
    auto_applied: outcomes.filter((o) => o.action === "auto_applied").length,
    suggested: outcomes.filter((o) => o.action === "suggested").length,
    ignored: outcomes.filter((o) => o.action === "ignored").length,
  });

  return { runId: run.id, status: "completed", outcomes };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ContactSnapshot = {
  snapshot: Record<string, string | null>;
};

async function loadContact(
  supabase: SupabaseClient,
  companyId: string,
  contactId: string,
): Promise<ContactSnapshot | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, email, phone, company_name, job_title")
    .eq("id", contactId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, string | null>;
  return {
    snapshot: {
      name: row.name ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      company_name: row.company_name ?? null,
      job_title: row.job_title ?? null,
    },
  };
}

async function upsertRun(
  supabase: SupabaseClient,
  input: EnrichmentRuntimeInput,
  now: Date,
): Promise<{ id: string; alreadyCompleted: boolean }> {
  // Try existing row first (idempotency).
  const existing = await supabase
    .from("contact_enrichment_runs")
    .select("id, status")
    .eq("message_id", input.messageId)
    .maybeSingle();
  if (existing.data) {
    const row = existing.data as { id: string; status: string };
    if (row.status === "completed" || row.status === "processing") {
      return { id: row.id, alreadyCompleted: true };
    }
    // Reset failed / skipped run for a retry.
    await supabase
      .from("contact_enrichment_runs")
      .update({ status: "processing", started_at: now.toISOString(), error: null })
      .eq("id", row.id);
    return { id: row.id, alreadyCompleted: false };
  }
  const { data, error } = await supabase
    .from("contact_enrichment_runs")
    .insert({
      company_id: input.companyId,
      contact_id: input.contactId,
      message_id: input.messageId,
      source_type: input.sourceType,
      status: "processing",
      started_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`failed to create enrichment run: ${error?.message ?? "unknown"}`);
  }
  return { id: (data as { id: string }).id, alreadyCompleted: false };
}

async function failRun(
  supabase: SupabaseClient,
  runId: string,
  error: string,
  now: Date,
): Promise<void> {
  await supabase
    .from("contact_enrichment_runs")
    .update({
      status: "failed",
      error,
      finished_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", runId);
}

function dedupeByField(entities: ExtractedEntity[]): ExtractedEntity[] {
  const bestByField = new Map<string, ExtractedEntity>();
  for (const e of entities) {
    const current = bestByField.get(e.field_key);
    if (!current || e.confidence > current.confidence) bestByField.set(e.field_key, e);
  }
  return Array.from(bestByField.values());
}

type EvaluatedEntity = {
  field_key: string;
  action: "auto_applied" | "suggested" | "ignored";
  reason: string;
  previous_value: string | null;
  new_value: string | null;
  columnPatch?: Record<string, string>;
  suggestionRow?: Record<string, unknown>;
  historyRow?: Record<string, unknown>;
};

function evaluateEntity(params: {
  entity: ExtractedEntity;
  contact: Record<string, string | null>;
  runId: string;
  input: EnrichmentRuntimeInput;
  model: string;
  now: Date;
}): EvaluatedEntity {
  const { entity, contact, runId, input, model, now } = params;
  const field = getBuiltInField(entity.field_key);

  // Unknown field → recorded as ignored, kept in history for observability.
  if (!field) {
    return {
      field_key: entity.field_key,
      action: "ignored",
      reason: "unknown_field",
      previous_value: null,
      new_value: entity.value,
      historyRow: buildHistoryRow({
        input,
        runId,
        entity,
        model,
        action: "ignored",
        previous_value: null,
        new_value: entity.value,
      }),
    };
  }

  const normalized = field.normalize(entity.value);
  if (!field.validate(normalized)) {
    return {
      field_key: entity.field_key,
      action: "ignored",
      reason: "invalid_value",
      previous_value: contact[field.column] ?? null,
      new_value: entity.value,
      historyRow: buildHistoryRow({
        input,
        runId,
        entity,
        model,
        action: "ignored",
        previous_value: contact[field.column] ?? null,
        new_value: entity.value,
      }),
    };
  }

  const current = contact[field.column] ?? null;
  const decision: EnrichmentDecision = decideEnrichment({
    currentValue: current,
    extractedValue: normalized,
    confidence: entity.confidence,
  });

  const previous_value = current;

  switch (decision.kind) {
    case "auto_apply":
      return {
        field_key: entity.field_key,
        action: "auto_applied",
        reason: decision.reason,
        previous_value,
        new_value: normalized,
        columnPatch: { [field.column]: normalized },
        historyRow: buildHistoryRow({
          input,
          runId,
          entity,
          model,
          action: "auto_applied",
          previous_value,
          new_value: normalized,
        }),
      };

    case "suggest":
      return {
        field_key: entity.field_key,
        action: "suggested",
        reason: decision.reason,
        previous_value,
        new_value: normalized,
        suggestionRow: {
          company_id: input.companyId,
          contact_id: input.contactId,
          run_id: runId,
          message_id: input.messageId,
          field_key: entity.field_key,
          current_value: previous_value != null ? JSON.stringify(previous_value) : null,
          suggested_value: JSON.stringify(normalized),
          confidence: entity.confidence,
          source_type: input.sourceType,
          model,
          status: "pending",
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
        historyRow: buildHistoryRow({
          input,
          runId,
          entity,
          model,
          action: "suggested",
          previous_value,
          new_value: normalized,
        }),
      };

    case "ignore":
      return {
        field_key: entity.field_key,
        action: "ignored",
        reason: decision.reason,
        previous_value,
        new_value: normalized,
        historyRow: buildHistoryRow({
          input,
          runId,
          entity,
          model,
          action: "ignored",
          previous_value,
          new_value: normalized,
        }),
      };
  }
}

function buildHistoryRow(params: {
  input: EnrichmentRuntimeInput;
  runId: string;
  entity: ExtractedEntity;
  model: string;
  action: "auto_applied" | "suggested" | "ignored";
  previous_value: string | null;
  new_value: string | null;
}): Record<string, unknown> {
  const { input, runId, entity, model, action, previous_value, new_value } = params;
  return {
    company_id: input.companyId,
    contact_id: input.contactId,
    run_id: runId,
    message_id: input.messageId,
    field_key: entity.field_key,
    previous_value: previous_value != null ? JSON.stringify(previous_value) : null,
    new_value: new_value != null ? JSON.stringify(new_value) : null,
    confidence: entity.confidence,
    action,
    source_type: input.sourceType,
    model,
    actor_id: null, // AI-driven; human-review actions land via a later phase
  };
}
