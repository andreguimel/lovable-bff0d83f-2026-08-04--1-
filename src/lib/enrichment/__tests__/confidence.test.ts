/**
 * Confidence policy tests — pure module, no I/O.
 * Enrichment-01 Fase 2.
 */
import { describe, it, expect } from "bun:test";
import { decideEnrichment, ENRICHMENT_THRESHOLDS } from "../confidence";

describe("decideEnrichment", () => {
  it("auto-applies when field is empty and confidence >= 0.95", () => {
    const d = decideEnrichment({ currentValue: null, extractedValue: "x@y.com", confidence: 0.99 });
    expect(d.kind).toBe("auto_apply");
    if (d.kind === "auto_apply") expect(d.reason).toBe("empty_field_high_confidence");
  });

  it("auto-applies at exactly the auto-apply threshold", () => {
    const d = decideEnrichment({
      currentValue: "",
      extractedValue: "x@y.com",
      confidence: ENRICHMENT_THRESHOLDS.autoApply,
    });
    expect(d.kind).toBe("auto_apply");
  });

  it("suggests when field is empty and confidence is between 0.70 and 0.95", () => {
    const d = decideEnrichment({ currentValue: null, extractedValue: "x@y.com", confidence: 0.85 });
    expect(d.kind).toBe("suggest");
    if (d.kind === "suggest") expect(d.reason).toBe("empty_field_medium_confidence");
  });

  it("ignores when confidence is below the suggest threshold", () => {
    const d = decideEnrichment({ currentValue: null, extractedValue: "x@y.com", confidence: 0.5 });
    expect(d.kind).toBe("ignore");
    if (d.kind === "ignore") expect(d.reason).toBe("below_threshold");
  });

  it("NEVER auto-applies to a non-empty field (invariant), even with high confidence", () => {
    const d = decideEnrichment({
      currentValue: "old@example.com",
      extractedValue: "new@example.com",
      confidence: 1.0,
    });
    expect(d.kind).toBe("suggest");
    if (d.kind === "suggest") expect(d.reason).toBe("divergent_value");
  });

  it("ignores when new value equals current value (case + whitespace insensitive)", () => {
    const d = decideEnrichment({
      currentValue: "Beatriz@Empresa.com",
      extractedValue: "  beatriz@empresa.com  ",
      confidence: 0.99,
    });
    expect(d.kind).toBe("ignore");
    if (d.kind === "ignore") expect(d.reason).toBe("same_value");
  });

  it("ignores empty extracted values regardless of confidence", () => {
    const d = decideEnrichment({ currentValue: null, extractedValue: "", confidence: 1.0 });
    expect(d.kind).toBe("ignore");
    if (d.kind === "ignore") expect(d.reason).toBe("empty_extraction");
  });

  it("suggests divergent value even when new-value confidence is below auto threshold", () => {
    const d = decideEnrichment({
      currentValue: "x@y.com",
      extractedValue: "z@y.com",
      confidence: 0.75,
    });
    expect(d.kind).toBe("suggest");
    if (d.kind === "suggest") expect(d.reason).toBe("divergent_value");
  });
});
