import type { LanguageModel } from "ai";

export type ResolvedAIProvider =
  | { provider: "openai"; apiKey: string; model: string; source: "user" }
  | { provider: "anthropic"; apiKey: string; model: string; source: "user" }
  | { provider: "google_gemini"; apiKey: string; model: string; source: "user" };

const DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  google_gemini: "gemini-2.5-flash",
};

/**
 * Reads the "Configurações → APIs" table and picks the most recently updated,
 * enabled AI integration for this company. Falls back to environment variables
 * (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY).
 */
export async function resolveActiveAIProvider(
  supabase: any,
  companyId?: string | null,
): Promise<ResolvedAIProvider> {
  if (companyId) {
    const { data, error } = await supabase
      .from("integrations")
      .select("provider, credentials, config, enabled, updated_at")
      .eq("company_id", companyId)
      .in("provider", ["openai", "anthropic", "google_gemini"])
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    if (row) {
      const creds = (row.credentials ?? {}) as Record<string, string>;
      const config = (row.config ?? {}) as Record<string, string>;
      const apiKey = creds.api_key;
      if (apiKey) {
        const p = row.provider as "openai" | "anthropic" | "google_gemini";
        return {
          provider: p,
          apiKey,
          model: config.default_model || DEFAULT_MODEL[p],
          source: "user",
        };
      }
    }
  }

  // Fallback para variáveis de ambiente próprias do usuário
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: DEFAULT_MODEL.openai,
      source: "user",
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: DEFAULT_MODEL.anthropic,
      source: "user",
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey) {
    return {
      provider: "google_gemini",
      apiKey: geminiKey,
      model: DEFAULT_MODEL.google_gemini,
      source: "user",
    };
  }

  throw new Error(
    "Nenhum provedor de IA (OpenAI, Anthropic ou Gemini) foi configurado no sistema. Por favor, cadastre sua API Key em Configurações → Integrações."
  );
}

/**
 * Builds an AI SDK LanguageModel from the resolved provider.
 * Returns { model, label } to display in the UI which provider actually ran.
 */
export async function buildGuardianModel(
  supabase: any,
  companyId?: string | null,
  requestedModel?: string,
): Promise<{ model: LanguageModel; label: string; providerId: ResolvedAIProvider["provider"]; usingFallback: boolean; modelId: string }> {
  const resolved = await resolveActiveAIProvider(supabase, companyId);
  const modelToUse = requestedModel || resolved.model;

  if (resolved.provider === "openai") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const p = createOpenAI({ apiKey: resolved.apiKey });
    return {
      model: p(modelToUse) as unknown as LanguageModel,
      label: `OpenAI · ${modelToUse}`,
      providerId: "openai",
      usingFallback: false,
      modelId: modelToUse,
    };
  }

  if (resolved.provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const p = createAnthropic({ apiKey: resolved.apiKey });
    return {
      model: p(modelToUse) as unknown as LanguageModel,
      label: `Anthropic · ${modelToUse}`,
      providerId: "anthropic",
      usingFallback: false,
      modelId: modelToUse,
    };
  }

  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const p = createGoogleGenerativeAI({ apiKey: resolved.apiKey });
  return {
    model: p(modelToUse) as unknown as LanguageModel,
    label: `Google Gemini · ${modelToUse}`,
    providerId: "google_gemini",
    usingFallback: false,
    modelId: modelToUse,
  };
}
