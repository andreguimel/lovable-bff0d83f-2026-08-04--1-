import type { HealthCheck } from "./types";

export const realtimeCheck: HealthCheck = {
  name: "realtime",
  timeoutMs: 2000,
  severity: "warning",
  async run() {
    // Realtime é WebSocket — não testável a partir do worker SSR.
    // Retornamos `degraded` com nota para checagem client-side.
    return { status: "degraded", latencyMs: 0, details: { note: "checked client-side" } };
  },
};
