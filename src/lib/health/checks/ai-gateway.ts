import type { HealthCheck } from "./types";

export const aiGatewayCheck: HealthCheck = {
  name: "ai-gateway",
  timeoutMs: 2500,
  severity: "warning",
  async run() {
    const started = Date.now();
    const key =
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) return { status: "degraded", latencyMs: 0, error: "Nenhum provedor próprio de IA configurado no servidor" };
    return { status: "healthy", latencyMs: Date.now() - started };
  },
};
