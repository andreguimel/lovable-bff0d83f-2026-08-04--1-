// Public cron endpoint for the Guardian.
// Called every N minutes by pg_cron. Iterates active companies, runs the
// Guardian scan and — when a company's system is critical — inserts a
// guardian_incidents row (deduped by fingerprint) so the panel (via Realtime)
// and the toast surface the alert without needing a user to log in and click.
//
// Auth: the caller must present the project's Supabase publishable key in the
// `apikey` header (canonical pattern from schedule-jobs-options docs). This
// prefix (`/api/public/*`) already bypasses Lovable's published-site auth.

import { createFileRoute } from "@tanstack/react-router";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const SCAN_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} excedeu ${ms}ms`)), ms),
    ),
  ]);
}

async function handle(request: Request) {
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publishable) return new Response("misconfigured", { status: 500, headers: NO_STORE });

  const provided = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
  if (provided !== publishable) return new Response("unauthorized", { status: 401, headers: NO_STORE });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buildGuardianScan } = await import("@/lib/guardian.server");

  const { data: companies, error: coErr } = await supabaseAdmin
    .from("companies")
    .select("id")
    .limit(200);
  if (coErr) return Response.json({ ok: false, error: coErr.message }, { status: 500, headers: NO_STORE });

  const summary: Array<{ companyId: string; status: string; score: number; created: number; error?: string }> = [];

  for (const c of companies ?? []) {
    const companyId = (c as { id: string }).id;
    try {
      const scan = await withTimeout(
        buildGuardianScan(supabaseAdmin as any, companyId),
        SCAN_TIMEOUT_MS,
        `scan(${companyId})`,
      );
      let created = 0;

      const critical = scan.incidents.filter((i) => i.severity === "critical");
      for (const inc of critical) {
        const fingerprint = `cron:${inc.kind}:${inc.id}`;
        const { data: existing } = await supabaseAdmin
          .from("guardian_incidents")
          .select("id, occurrences")
          .eq("company_id", companyId)
          .eq("fingerprint", fingerprint)
          .in("status", ["open", "analyzing"])
          .maybeSingle();

        if (existing) {
          await supabaseAdmin
            .from("guardian_incidents")
            .update({
              occurrences: (existing.occurrences ?? 1) + 1,
              last_seen_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          const { data: insertedRow, error: insErr } = await supabaseAdmin
            .from("guardian_incidents")
            .insert({
              company_id: companyId,
              kind: "network",
              severity: "critical",
              status: "open",
              message: `[Guardião · varredura automática] ${inc.title}`,
              route: `/settings/audit`,
              fingerprint,
              context: {
                source: "cron",
                incidentKind: inc.kind,
                probableCause: inc.probableCause,
                recommendedAction: inc.recommendedAction,
                repairAction: inc.repairAction,
                entityId: inc.id,
                payload: inc.payload,
              },
              occurrences: 1,
              last_seen_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();
          if (!insErr) {
            created += 1;
            // OBS-H-01: alerta externo best-effort — nunca trava o cron.
            const { sendGuardianAlert } = await import("@/lib/observability/guardian-alerter.server");
            await sendGuardianAlert(
              {
                incidentId: (insertedRow?.id as string) ?? "",
                companyId,
                kind: "network",
                severity: "critical",
                message: `[Guardião · varredura automática] ${inc.title}`,
                route: "/settings/audit",
                fingerprint,
                source: "cron",
              },
              supabaseAdmin,
            ).catch(() => undefined);
          }
        }
      }

      await supabaseAdmin.from("guardian_runs").insert({
        company_id: companyId,
        action: "cronScan",
        status: scan.status === "critical" ? "warning" : "ok",
        payload: { source: "cron" },
        result: {
          status: scan.status,
          score: scan.score,
          incidents: scan.incidents.length,
          createdAlerts: created,
        },
      });

      await supabaseAdmin.from("guardian_health_snapshots").insert({
        company_id: companyId,
        status: scan.status,
        score: scan.score,
        health: scan.health as any,
        incident_count: scan.incidents.length,
        critical_count: critical.length,
        source: "cron",
      });


      summary.push({ companyId, status: scan.status, score: scan.score, created });
    } catch (err) {
      summary.push({ companyId, status: "error", score: 0, created: 0, error: (err as Error).message });
    }
  }

  return Response.json({ ok: true, ran: summary.length, summary }, { headers: NO_STORE });
}

export const Route = createFileRoute("/api/public/guardian-cron")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
