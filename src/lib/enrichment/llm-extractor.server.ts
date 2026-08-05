/**
 * LLM-backed EntityExtractor via Lovable AI Gateway.
 *
 * Kept isolated behind the EntityExtractor contract so the runtime can
 * remain provider-agnostic and fully testable. Not wired into any
 * pipeline in Phase 2 — the runtime accepts any extractor and the
 * production dispatch (event bus) lands in a later phase.
 */

import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "../ai-gateway.server";
import {
  ExtractorError,
  type EntityExtractor,
  type ExtractionInput,
  type ExtractionResult,
} from "./extractor-contract.server";

const EntitySchema = z.object({
  field_key: z.string(),
  value: z.string(),
  confidence: z.number(),
  evidence: z.string().optional(),
});

const ResponseSchema = z.object({
  entities: z.array(EntitySchema),
});

const SYSTEM_PROMPT = `You are a Portuguese-first CRM enrichment extractor.
Given a customer message, return structured entities you can identify
verbatim from the text. Output ONLY entities you actually observed —
never guess. Confidence in [0,1] must reflect how unambiguous the
extraction is:
  - 0.95..1.00 → explicit and unambiguous (e.g. "meu email é x@y.com")
  - 0.75..0.94 → clearly stated but format-borderline
  - 0.50..0.74 → implied / partial
  - below 0.50 → do not include
Known field keys: name, email, phone, company_name, job_title, cpf,
cnpj, rg, birthdate, cep, address, city, state, website, instagram,
razao_social, nome_fantasia, pix_key, license_plate.`;

export type LlmExtractorOptions = {
  /** Full "vendor/model" id from the Lovable AI chat catalog. */
  model?: string;
};

export function createLlmExtractor(
  apiKey: string,
  opts: LlmExtractorOptions = {},
): EntityExtractor {
  const model = opts.model ?? "google/gemini-3.5-flash";
  const gateway = createLovableAiGatewayProvider(apiKey);

  return {
    async extract(input: ExtractionInput): Promise<ExtractionResult> {
      const started = Date.now();
      try {
        const result = await generateText({
          model: gateway(model),
          system: SYSTEM_PROMPT,
          prompt: buildPrompt(input),
          output: Output.object({ schema: ResponseSchema }),
        });
        const latencyMs = Date.now() - started;
        return {
          model,
          latencyMs,
          tokenUsage: result.usage
            ? {
                input: (result.usage as { inputTokens?: number }).inputTokens ?? 0,
                output: (result.usage as { outputTokens?: number }).outputTokens ?? 0,
              }
            : undefined,
          entities: (result.output as { entities: ExtractionResult["entities"] }).entities,
        };
      } catch (err) {
        if (err instanceof NoObjectGeneratedError) {
          throw new ExtractorError("invalid_response", "LLM returned unparseable output", false);
        }
        const msg = err instanceof Error ? err.message : String(err);
        const transient = /timeout|429|ECONN|network|fetch failed/i.test(msg);
        throw new ExtractorError(
          transient ? "transient" : "provider_error",
          msg,
          transient,
        );
      }
    },
  };
}

function buildPrompt(input: ExtractionInput): string {
  const knownLines = Object.entries(input.known ?? {})
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n") || "  (empty)";
  return `Source: ${input.sourceType}
Known contact fields:
${knownLines}

Message:
"""
${input.text}
"""`;
}
