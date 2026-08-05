import { createFileRoute } from "@tanstack/react-router";

/**
 * Liveness/Readiness probes. Estrutura pronta para Kubernetes/Fly/Cloudflare
 * mesmo que ainda não haja orquestrador. Convenções:
 *
 *   GET /api/public/health  → agregado (deep check)
 *   GET /api/public/live    → processo respondendo (raso)
 *   GET /api/public/ready   → dependências prontas (deep)
 */

async function checkSupabase(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { ok: false, latency_ms: 0, error: "missing_env" };
  const t0 = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key },
    });
    return { ok: res.ok || res.status === 404, latency_ms: Date.now() - t0 };
  } catch (e: any) {
    return { ok: false, latency_ms: Date.now() - t0, error: String(e?.message ?? e) };
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await checkSupabase();
        const body = {
          status: supabase.ok ? "ok" : "degraded",
          version: process.env.APP_VERSION ?? "dev",
          uptime_ms: Math.floor(performance.now()),
          checks: { supabase },
          timestamp: new Date().toISOString(),
        };
        return new Response(JSON.stringify(body), {
          status: supabase.ok ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
