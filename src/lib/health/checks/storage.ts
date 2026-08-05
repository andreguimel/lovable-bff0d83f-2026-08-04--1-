import type { HealthCheck } from "./types";

export const storageCheck: HealthCheck = {
  name: "storage",
  timeoutMs: 2500,
  severity: "warning",
  async run() {
    const started = Date.now();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.storage.listBuckets();
      if (error) throw error;
      return { status: "healthy", latencyMs: Date.now() - started };
    } catch (err) {
      return { status: "degraded", latencyMs: Date.now() - started, error: (err as Error).message };
    }
  },
};
