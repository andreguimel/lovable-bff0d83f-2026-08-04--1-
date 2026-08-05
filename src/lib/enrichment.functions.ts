/**
 * Contact Enrichment · Phase 3 — Server Functions
 *
 * User-facing operations for the Enrichment Agent. Business logic lives
 * in the pure `applyApproval` / `applyRejection` helpers below so it can
 * be unit-tested without spinning up a real Supabase client. The
 * `createServerFn` wrappers just resolve the request-scoped clients
 * (user-scoped `context.supabase` + `supabaseAdmin` for the audit
 * append) and delegate.
 *
 * INVARIANTS
 *   - Never overwrite a contact field without an explicit approve call.
 *   - Never insert history without a matching suggestion transition.
 *   - Approve/reject are idempotent: re-applying to an already-reviewed
 *     suggestion is a no-op that returns the existing state.
 *   - History rows are inserted with the admin client (server-only) —
 *     the table has no `authenticated` write policy on purpose.
 */

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getBuiltInField } from "./enrichment/field-registry.server";

// ---------------- Types ----------------

type EnrichmentSourceType =
  | "audio_transcript"
  | "ocr_document"
  | "ocr_image"
  | "text_message";

type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json | undefined }
  | Json[];

export type SuggestionRow = {
  id: string;
  company_id: string;
  contact_id: string;
  run_id: string | null;
  message_id: string | null;
  field_key: string;
  current_value: Json | null;
  suggested_value: Json;
  confidence: number;
  source_type: EnrichmentSourceType;
  model: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  reviewed_by: string | null;
};

export type ApprovalDeps = {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  userId: string;
  now?: () => Date;
};

function jsonToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return String(v);
}

// ---------------- Pure helpers (testable) ----------------

export type ApprovalResult =
  | { status: "approved"; alreadyReviewed: false; appliedValue: string }
  | { status: "approved" | "rejected" | "expired"; alreadyReviewed: true };

export async function applyApproval(
  deps: ApprovalDeps,
  input: { suggestionId: string; overrideValue?: string },
): Promise<ApprovalResult> {
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();

  const { data: suggestion, error: loadErr } = await deps.supabase
    .from("contact_enrichment_suggestions")
    .select(
      "id, company_id, contact_id, run_id, message_id, field_key, current_value, suggested_value, confidence, source_type, model, status, reviewed_by",
    )
    .eq("id", input.suggestionId)
    .maybeSingle<SuggestionRow>();

  if (loadErr) throw new Error(loadErr.message);
  if (!suggestion) throw new Error("suggestion_not_found");

  if (suggestion.status !== "pending") {
    return { status: suggestion.status, alreadyReviewed: true };
  }

  const field = getBuiltInField(suggestion.field_key);
  if (!field) throw new Error(`unsupported_field: ${suggestion.field_key}`);

  const rawValue = input.overrideValue ?? jsonToString(suggestion.suggested_value);
  if (!rawValue) throw new Error("empty_value");

  const normalized = field.normalize(rawValue);
  if (!field.validate(normalized)) throw new Error(`invalid_value:${field.key}`);

  // 1) Patch contacts (RLS: company member).
  const patch = { [field.column]: normalized, updated_at: nowIso } as unknown as {
    name?: string;
    email?: string;
    phone?: string;
    company_name?: string;
    job_title?: string;
    updated_at?: string;
  };
  const { error: patchErr } = await deps.supabase
    .from("contacts")
    .update(patch)
    .eq("id", suggestion.contact_id)
    .eq("company_id", suggestion.company_id);
  if (patchErr) throw new Error(`contacts_update_failed: ${patchErr.message}`);

  // 2) Flip suggestion status (RLS: contacts.enrichment.review).
  const { error: suggErr } = await deps.supabase
    .from("contact_enrichment_suggestions")
    .update({
      status: "approved",
      reviewed_by: deps.userId,
      reviewed_at: nowIso,
      review_reason: input.overrideValue ? "approved_with_override" : "approved",
    })
    .eq("id", suggestion.id)
    .eq("status", "pending");
  if (suggErr) throw new Error(`suggestion_update_failed: ${suggErr.message}`);

  // 3) Append history via admin (server-only write).
  await deps.supabaseAdmin.from("contact_enrichment_history").insert({
    company_id: suggestion.company_id,
    contact_id: suggestion.contact_id,
    run_id: suggestion.run_id,
    suggestion_id: suggestion.id,
    message_id: suggestion.message_id,
    field_key: suggestion.field_key,
    previous_value: suggestion.current_value ?? null,
    new_value: normalized,
    confidence: suggestion.confidence,
    action: "applied_from_suggestion",
    source_type: suggestion.source_type,
    model: suggestion.model,
    actor_id: deps.userId,
  });

  return { status: "approved", alreadyReviewed: false, appliedValue: normalized };
}

export type RejectionResult =
  | { status: "rejected"; alreadyReviewed: false }
  | { status: "approved" | "rejected" | "expired"; alreadyReviewed: true };

export async function applyRejection(
  deps: ApprovalDeps,
  input: { suggestionId: string; reason?: string },
): Promise<RejectionResult> {
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();

  const { data: suggestion, error: loadErr } = await deps.supabase
    .from("contact_enrichment_suggestions")
    .select(
      "id, company_id, contact_id, run_id, message_id, field_key, current_value, suggested_value, confidence, source_type, model, status, reviewed_by",
    )
    .eq("id", input.suggestionId)
    .maybeSingle<SuggestionRow>();

  if (loadErr) throw new Error(loadErr.message);
  if (!suggestion) throw new Error("suggestion_not_found");
  if (suggestion.status !== "pending") {
    return { status: suggestion.status, alreadyReviewed: true };
  }

  const { error: suggErr } = await deps.supabase
    .from("contact_enrichment_suggestions")
    .update({
      status: "rejected",
      reviewed_by: deps.userId,
      reviewed_at: nowIso,
      review_reason: input.reason ?? "rejected",
    })
    .eq("id", suggestion.id)
    .eq("status", "pending");
  if (suggErr) throw new Error(`suggestion_update_failed: ${suggErr.message}`);

  await deps.supabaseAdmin.from("contact_enrichment_history").insert({
    company_id: suggestion.company_id,
    contact_id: suggestion.contact_id,
    run_id: suggestion.run_id,
    suggestion_id: suggestion.id,
    message_id: suggestion.message_id,
    field_key: suggestion.field_key,
    previous_value: suggestion.current_value ?? null,
    new_value: jsonToString(suggestion.suggested_value),
    confidence: suggestion.confidence,
    action: "rejected",
    source_type: suggestion.source_type,
    model: suggestion.model,
    actor_id: deps.userId,
  });

  return { status: "rejected", alreadyReviewed: false };
}

// ---------------- Server functions ----------------

const listPendingInput = z
  .object({
    contactId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .optional();

export const listPendingEnrichmentSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof listPendingInput>) => listPendingInput.parse(i))
  .handler(async ({ data, context }) => {
    const limit = data?.limit ?? 50;
    let q = context.supabase
      .from("contact_enrichment_suggestions")
      .select(
        "id, contact_id, field_key, current_value, suggested_value, confidence, source_type, model, status, message_id, run_id, created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (data?.contactId) q = q.eq("contact_id", data.contactId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { suggestions: rows ?? [] };
  });

const historyInput = z.object({
  contactId: z.string().uuid(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const listContactEnrichmentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof historyInput>) => historyInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contact_enrichment_history")
      .select(
        "id, contact_id, field_key, previous_value, new_value, confidence, action, source_type, model, actor_id, suggestion_id, run_id, message_id, created_at",
      )
      .eq("contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (error) throw new Error(error.message);
    return { history: rows ?? [] };
  });

const approveInput = z.object({
  suggestionId: z.string().uuid(),
  overrideValue: z.string().min(1).max(500).optional(),
});

export const approveEnrichmentSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof approveInput>) => approveInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return applyApproval(
      { supabase: context.supabase, supabaseAdmin, userId: context.userId },
      data,
    );
  });

const rejectInput = z.object({
  suggestionId: z.string().uuid(),
  reason: z.string().min(1).max(500).optional(),
});

export const rejectEnrichmentSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof rejectInput>) => rejectInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return applyRejection(
      { supabase: context.supabase, supabaseAdmin, userId: context.userId },
      data,
    );
  });
