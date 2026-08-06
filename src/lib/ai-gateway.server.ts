/**
 * @deprecated O Lovable AI Gateway foi descontinuado em favor do uso exclusivo de provedores de IA próprios (OpenAI, Anthropic, Gemini).
 */
export function createLovableAiGatewayProvider(_apiKey?: string) {
  throw new Error(
    "Lovable AI Gateway descontinuado. Configure sua chave de API (OpenAI, Anthropic ou Gemini) em Configurações → Integrações."
  );
}
