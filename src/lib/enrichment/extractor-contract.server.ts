/**
 * EntityExtractor contract — the single interface every enrichment
 * source (LLM over text, LLM over STT transcript, LLM over OCR text)
 * must implement. Server-only.
 *
 * The runtime is decoupled from any specific model provider: it accepts
 * an extractor instance and only reads the ExtractionResult shape below.
 * Tests inject deterministic stub extractors; production wires in the
 * LLM-backed implementation from `llm-extractor.server.ts`.
 */

export type EnrichmentSourceType =
  | "text_message"
  | "audio_transcript"
  | "ocr_document"
  | "ocr_image";

export type ExtractedEntity = {
  /** Canonical field key. Built-in fields recognized in Phase 2:
   *  name | email | phone | company_name | job_title.
   *  Any other key (cpf, cnpj, cep, address, pix_key, birthdate, etc.)
   *  is preserved verbatim and logged as `unknown_field`. */
  field_key: string;
  value: string;
  /** Model self-reported confidence in [0, 1]. */
  confidence: number;
  /** Optional short quote from the source that justified the value. */
  evidence?: string;
};

export type ExtractionInput = {
  companyId: string;
  contactId: string;
  messageId: string;
  sourceType: EnrichmentSourceType;
  /** Full text to analyze — already transcribed / OCR'd upstream. */
  text: string;
  /** Existing contact fields, so the extractor can bias toward gaps. */
  known?: Partial<Record<string, string | null>>;
};

export type ExtractionResult = {
  model: string;
  latencyMs: number;
  tokenUsage?: Record<string, number>;
  entities: ExtractedEntity[];
};

export interface EntityExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

export class ExtractorError extends Error {
  readonly code: "provider_error" | "invalid_response" | "transient" | "auth_error";
  readonly retryable: boolean;
  constructor(code: ExtractorError["code"], message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = "ExtractorError";
  }
}
