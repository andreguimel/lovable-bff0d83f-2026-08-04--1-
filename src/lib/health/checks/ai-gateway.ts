import type { HealthCheck } from "./types";

export const aiGatewayCheck: HealthCheck = {
  name: "ai-gateway",
  timeoutMs: 2500,
  severity: "warning",
  async run() {
    const started = Date.now();
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { status: "unhealthy", latencyMs: 0, error: "LOVABLE_API_KEY ausente" };
    return { status: "healthy", latencyMs: Date.now() - started };
  },
};
