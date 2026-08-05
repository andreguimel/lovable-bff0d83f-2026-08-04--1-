import type { LanguageModel } from "ai";

export type ResolvedAIProvider =
  | { provider: "openai"; apiKey: string; model: string; source: "user" }
  | { provider: "anthropic"; apiKey: string; model: string; source: "user" }
  | { provider: "google_gemini"; apiKey: string; model: string; source: "user" }
  | { provider: "lovable"; apiKey: string; model: string; source: "fallback" };

const DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  google_gemini: "gemini-2.5-flash",
  lovable: "google/gemini-3.5-flash",
};

/**
 * Reads the "Configurações → APIs" table and picks the most recently updated,
 * enabled AI integration for this company. Falls back to Lovable AI Gateway
 * when nothing is configured.
 */
export async function resolveActiveAIProvider(
  supabase: any,
  companyId: string,
): Promise<ResolvedAIProvider> {
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
  const lov = process.env.LOVABLE_API_KEY;
  if (!lov) throw new Error("Nenhum provedor de IA configurado e LOVABLE_API_KEY ausente.");
  return { provider: "lovable", apiKey: lov, model: DEFAULT_MODEL.lovable, source: "fallback" };
}

/**
 * Builds an AI SDK LanguageModel from the resolved provider.
 * Returns { model, label } to display in the UI which provider actually ran.
 */
export async function buildGuardianModel(
  supabase: any,
  companyId: string,
): Promise<{ model: LanguageModel; label: string; providerId: ResolvedAIProvider["provider"]; usingFallback: boolean; modelId: string }> {
  const resolved = await resolveActiveAIProvider(supabase, companyId);

  if (resolved.provider === "openai") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const p = createOpenAI({ apiKey: resolved.apiKey });
    return {
      model: p(resolved.model) as unknown as LanguageModel,
      label: `OpenAI · ${resolved.model}`,
      providerId: "openai",
      usingFallback: false,
      modelId: resolved.model,
    };
  }
  if (resolved.provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const p = createAnthropic({ apiKey: resolved.apiKey });
    return {
      model: p(resolved.model) as unknown as LanguageModel,
      label: `Anthropic · ${resolved.model}`,
      providerId: "anthropic",
      usingFallback: false,
      modelId: resolved.model,
    };
  }
  if (resolved.provider === "google_gemini") {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const p = createGoogleGenerativeAI({ apiKey: resolved.apiKey });
    return {
      model: p(resolved.model) as unknown as LanguageModel,
      label: `Google Gemini · ${resolved.model}`,
      providerId: "google_gemini",
      usingFallback: false,
      modelId: resolved.model,
    };
  }

  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const gw = createLovableAiGatewayProvider(resolved.apiKey);
  return {
    model: gw(resolved.model) as unknown as LanguageModel,
    label: `Lovable AI · ${resolved.model} (fallback)`,
    providerId: "lovable",
    usingFallback: true,
    modelId: resolved.model,
  };
}
