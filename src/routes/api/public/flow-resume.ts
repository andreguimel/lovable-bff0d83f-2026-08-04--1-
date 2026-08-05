/**
 * Public Scheduler endpoint — retoma runs cujo `resume_at` já venceu.
 *
 * Autenticação (qualquer um serve, por ordem):
 *   1) header `apikey`  === SUPABASE_PUBLISHABLE_KEY  (padrão pg_cron do projeto)
 *   2) header `x-scheduler-secret` === FLOW_SCHEDULER_SECRET  (cron externo)
 *
 * Ambos os métodos:
 *   - GET  → health check (sem auth): retorna último heartbeat + backlog atual.
 *   - POST → executa o tick: pega até 50 runs elegíveis, processa, grava heartbeat.
 *
 * Métricas gravadas em `scheduler_heartbeats` a cada tick:
 *   processed, resumed, failed, duration_ms, next_expected_at, notes.
 *
 * Regra Runtime-02.3: este arquivo é o ÚNICO owner do Scheduler.
 */
import { createFileRoute } from "@tanstack/react-router";

const MAX_BATCH = 50;

function isAuthorized(request: Request): boolean {
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.FLOW_SCHEDULER_SECRET;
  const apikey = request.headers.get("apikey");
  const custom = request.headers.get("x-scheduler-secret");
  if (anon && apikey && apikey === anon) return true;
  if (secret && custom && custom === secret) return true;
  return false;
}

export const Route = createFileRoute("/api/public/flow-resume")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [hbRes, backlogRes] = await Promise.all([
          supabaseAdmin
            .from("scheduler_heartbeats" as never)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabaseAdmin
            .from("flow_runs")
            .select("id", { count: "exact", head: true })
            .in("state" as never, ["WAITING_DELAY", "RETRYING", "WAITING_REPLY"] as never)
            .not("resume_at" as never, "is", null as never)
            .lte("resume_at" as never, new Date().toISOString() as never),
        ]);
        const last = (hbRes.data ?? null) as null | {
          created_at: string;
          processed: number;
          resumed: number;
          failed: number;
          duration_ms: number;
        };
        const backlog = backlogRes.count ?? 0;
        const now = Date.now();
        const staleMs = last ? now - Date.parse(last.created_at) : Infinity;
        const healthy = last != null && staleMs < 5 * 60_000; // <5min desde último tick
        return Response.json({
          ok: true,
          healthy,
          backlog_due_now: backlog,
          last_heartbeat: last,
          seconds_since_last_tick: last ? Math.round(staleMs / 1000) : null,
          next_expected_within_seconds: 60,
          ts: new Date().toISOString(),
        });
      },

      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const started = Date.now();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { executeRun } = await import("@/lib/flow-executor.server");

        const nowIso = new Date().toISOString();
        const { data: due, error: dueErr } = await supabaseAdmin
          .from("flow_runs")
          .select("id")
          .in("state" as never, ["WAITING_DELAY", "RETRYING", "WAITING_REPLY"] as never)
          .not("resume_at" as never, "is", null as never)
          .lte("resume_at" as never, nowIso as never)
          .order("resume_at" as never, { ascending: true })
          .limit(MAX_BATCH);

        if (dueErr) {
          console.error("[flow-scheduler] query failed", dueErr);
        }

        const runs = (due ?? []) as Array<{ id: string }>;
        const results: Array<Record<string, unknown>> = [];
        let resumed = 0;
        let failed = 0;
        for (const r of runs) {
          try {
            const res = (await executeRun({
              supabase: supabaseAdmin as never,
              runId: r.id,
            })) as { ok?: boolean };
            if (res?.ok === false) failed++;
            else resumed++;
            results.push({ runId: r.id, ...res });
          } catch (e) {
            failed++;
            const message = e instanceof Error ? e.message : String(e);
            console.error("[flow-scheduler] executeRun failed", r.id, message);
            results.push({ runId: r.id, error: message });
          }
        }

        const duration = Date.now() - started;
        // Heartbeat — best-effort, nunca faz o tick falhar.
        try {
          await supabaseAdmin.from("scheduler_heartbeats" as never).insert({
            source: "flow-resume",
            processed: runs.length,
            resumed,
            failed,
            duration_ms: duration,
            next_expected_at: new Date(Date.now() + 60_000).toISOString(),
            notes: dueErr ? { queryError: dueErr.message } : null,
          } as never);
        } catch (e) {
          console.error("[flow-scheduler] heartbeat insert failed", e);
        }

        return Response.json({
          ok: true,
          processed: runs.length,
          resumed,
          failed,
          duration_ms: duration,
          results,
          ts: nowIso,
        });
      },
    },
  },
});
