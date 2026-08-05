import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/cascade-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { _executeCascadeStep } = await import("@/lib/cascade.functions");

        // RACE SAFETY: claim atômico via cascade_run_claim (lock TTL 60s).
        // Se dois cron workers correrem, cada RPC devolve runs distintas.
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (let i = 0; i < 50; i++) {
          const { data: claimed, error: cerr } = await supabaseAdmin.rpc("cascade_run_claim", { _ttl_seconds: 60 });
          if (cerr) return Response.json({ error: cerr.message }, { status: 500 });
          const row = (claimed as Array<{ id: string; lock_token: string }> | null)?.[0];
          if (!row) break;
          try {
            await _executeCascadeStep(supabaseAdmin, row.id);
            results.push({ id: row.id, ok: true });
          } catch (e) {
            results.push({ id: row.id, ok: false, error: e instanceof Error ? e.message : String(e) });
            // Release lock em caso de exceção não tratada
            await supabaseAdmin.rpc("cascade_run_release", { _run_id: row.id, _lock_token: row.lock_token });
          }
        }
        return Response.json({ processed: results.length, results });
      },
      GET: async () =>
        Response.json({ ok: true, hint: "POST com header apikey para processar cascade_runs pendentes" }),
    },
  },
});
