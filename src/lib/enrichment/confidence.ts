/**
 * Confidence policy for the Contact Enrichment Agent.
 *
 * Pure module — no I/O, no side effects. Kept outside `.server.ts` so it
 * can be reused by tests and (future) client-side preview components.
 *
 * Thresholds (per Enrichment-01 spec):
 *   - >= 0.95 → auto-apply (only when the target field is empty)
 *   - >= 0.70 → suggest for human review
 *   - <  0.70 → ignore
 *
 * INVARIANT: a non-empty field is never overwritten automatically. Any
 * divergent value on a filled field becomes a suggestion, regardless of
 * confidence.
 */

export const ENRICHMENT_THRESHOLDS = {
  autoApply: 0.95,
  suggest: 0.7,
} as const;

export type EnrichmentDecision =
  | { kind: "auto_apply"; reason: "empty_field_high_confidence" }
  | { kind: "suggest"; reason: "empty_field_medium_confidence" | "divergent_value" }
  | { kind: "ignore"; reason: "same_value" | "below_threshold" | "empty_extraction" };

export function decideEnrichment(input: {
  currentValue: string | null | undefined;
  extractedValue: string | null | undefined;
  confidence: number;
}): EnrichmentDecision {
  const extracted = normalizeForCompare(input.extractedValue);
  if (!extracted) return { kind: "ignore", reason: "empty_extraction" };

  const current = normalizeForCompare(input.currentValue);
  const currentIsEmpty = current === "";

  if (!currentIsEmpty && current === extracted) {
    return { kind: "ignore", reason: "same_value" };
  }

  if (input.confidence < ENRICHMENT_THRESHOLDS.suggest) {
    return { kind: "ignore", reason: "below_threshold" };
  }

  if (currentIsEmpty) {
    return input.confidence >= ENRICHMENT_THRESHOLDS.autoApply
      ? { kind: "auto_apply", reason: "empty_field_high_confidence" }
      : { kind: "suggest", reason: "empty_field_medium_confidence" };
  }

  // Non-empty field with divergent value → NEVER auto, always suggest.
  return { kind: "suggest", reason: "divergent_value" };
}

function normalizeForCompare(v: string | null | undefined): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}
