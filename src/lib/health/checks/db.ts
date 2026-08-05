import type { HealthCheck } from "./types";

export const dbCheck: HealthCheck = {
  name: "database",
  timeoutMs: 3000,
  severity: "critical",
  async run() {
    const started = Date.now();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("companies")
        .select("id", { head: true, count: "exact" })
        .limit(1);
      if (error) throw error;
      return { status: "healthy", latencyMs: Date.now() - started };
    } catch (err) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - started,
        error: (err as Error).message,
      };
    }
  },
};
