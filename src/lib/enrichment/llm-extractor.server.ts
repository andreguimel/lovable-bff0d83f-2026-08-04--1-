/**
 * LLM-backed EntityExtractor.
 *
 * Kept isolated behind the EntityExtractor contract so the runtime can
 * remain provider-agnostic and fully testable.
 */

import { generateText, Output, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";
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

export function createLlmExtractor(
  languageModel: LanguageModel,
  modelName = "custom-model",
): EntityExtractor {
  return {
    async extract(input: ExtractionInput): Promise<ExtractionResult> {
      const started = Date.now();
      try {
        const result = await generateText({
          model: languageModel,
          system: SYSTEM_PROMPT,
          prompt: buildPrompt(input),
          output: Output.object({ schema: ResponseSchema }),
        });

        const parsed = result.output;
        const latencyMs = Date.now() - started;

        const entities = parsed.entities
          .filter((e) => e.confidence >= 0.5)
          .map((e) => ({
            field_key: e.field_key,
            value: e.value,
            confidence: e.confidence,
            evidence: e.evidence ?? e.value,
          }));

        return {
          model: modelName,
          entities,
          latencyMs,
          tokenUsage: {
            prompt: result.usage?.inputTokens ?? 0,
            completion: result.usage?.outputTokens ?? 0,
          },
        };
      } catch (err: unknown) {

        if (NoObjectGeneratedError.isInstance(err)) {
          throw new ExtractorError("invalid_response", err.message, false);
        }

        const message = err instanceof Error ? err.message : String(err);
        throw new ExtractorError("provider_error", message, true);
      }
    },
  };
}

function buildPrompt(input: ExtractionInput): string {
  const parts: string[] = [];
  if (input.known) {
    parts.push(`Known contact info: ${JSON.stringify(input.known)}`);
  }
  parts.push(`Message to extract from:\n"${input.text}"`);
  return parts.join("\n\n");
}
