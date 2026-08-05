import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const filterSchema = z
  .object({
    days: z.number().int().min(1).max(365).optional(),
    status: z.string().optional(),
    channelId: z.string().uuid().optional(),
    search: z.string().optional(),
  })
  .optional();

function sinceISO(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString();
}

// CSV cell escape with formula-injection guard (leading =, +, -, @, \t, \r).
// See OWASP "CSV Injection". Prefixing with a single quote neutralizes
// spreadsheet formula evaluation while remaining human-readable.
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}


function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n");
}

// ---------- Conversations report ----------
export const listConversationsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { days?: number; status?: string; channelId?: string; search?: string } | undefined) =>
      filterSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const days = data?.days ?? 30;
    let q = context.supabase
      .from("conversations")
      .select(
        "id, status, created_at, updated_at, last_message_at, last_message_preview, unread_count, contact:contacts(name, phone), channel:channels!channel_id(name)",
      )
      .gte("created_at", sinceISO(days))
      .order("created_at", { ascending: false })
      .limit(500);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status as "open" | "pending" | "resolved");
    if (data?.channelId) q = q.eq("channel_id", data.channelId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let filtered = rows ?? [];
    if (data?.search) {
      const s = data.search.toLowerCase();
      filtered = filtered.filter((r) => {
        const c = r.contact as { name?: string; phone?: string } | null;
        return (
          c?.name?.toLowerCase().includes(s) ||
          c?.phone?.toLowerCase().includes(s) ||
          (r.last_message_preview as string | null)?.toLowerCase().includes(s)
        );
      });
    }
    return filtered.map((r) => ({
      id: r.id as string,
      status: r.status as string,
      created_at: r.created_at as string,
      last_message_at: r.last_message_at as string | null,
      last_message_preview: r.last_message_preview as string | null,
      unread_count: (r.unread_count as number | null) ?? 0,
      contact_name: (r.contact as { name?: string } | null)?.name ?? null,
      contact_phone: (r.contact as { phone?: string } | null)?.phone ?? null,
      channel_name: (r.channel as { name?: string } | null)?.name ?? null,
    }));
  });

// ---------- Broadcasts report ----------
export const listBroadcastsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => filterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const days = data?.days ?? 90;
    const { data: rows, error } = await context.supabase
      .from("broadcasts")
      .select(
        "id, name, status, created_at, scheduled_at, started_at, completed_at, total_recipients, sent_count, delivered_count, read_count, failed_count, channel:channels!channel_id(name)",
      )
      .gte("created_at", sinceISO(days))
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      ...r,
      channel_name: (r.channel as { name?: string } | null)?.name ?? null,
    }));
  });

// ---------- Cascades report ----------
export const listCascadesReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => filterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const days = data?.days ?? 90;
    const since = sinceISO(days);
    const [policiesRes, runsRes, attemptsRes] = await Promise.all([
      context.supabase.from("cascade_policies").select("id, name, active, steps"),
      context.supabase.from("cascade_runs").select("id, policy_id, status, started_at, completed_at").gte("created_at", since),
      context.supabase.from("cascade_attempts").select("id, run_id, step_index, channel_type, status").gte("created_at", since),
    ]);
    const policies = policiesRes.data ?? [];
    const runs = runsRes.data ?? [];
    const attempts = attemptsRes.data ?? [];

    const runsByPolicy = new Map<string, typeof runs>();
    for (const r of runs) {
      const arr = runsByPolicy.get(r.policy_id as string) ?? [];
      arr.push(r);
      runsByPolicy.set(r.policy_id as string, arr);
    }
    const attemptsByRun = new Map<string, typeof attempts>();
    for (const a of attempts) {
      const arr = attemptsByRun.get(a.run_id as string) ?? [];
      arr.push(a);
      attemptsByRun.set(a.run_id as string, arr);
    }

    return policies.map((p) => {
      const pRuns = runsByPolicy.get(p.id as string) ?? [];
      const count = (s: string) => pRuns.filter((r) => r.status === s).length;
      const steps = Array.isArray(p.steps) ? (p.steps as Array<{ channel_type: string }>) : [];
      const perStep = steps.map((s, idx) => {
        const sent = pRuns.reduce((acc, r) => {
          const at = attemptsByRun.get(r.id as string) ?? [];
          return acc + at.filter((a) => a.step_index === idx && (a.status === "sent" || a.status === "delivered")).length;
        }, 0);
        return { step: idx + 1, channel: s.channel_type, sent };
      });
      return {
        id: p.id as string,
        name: p.name as string,
        active: p.active as boolean,
        total_runs: pRuns.length,
        delivered: count("delivered"),
        read: count("read"),
        exhausted: count("exhausted"),
        cancelled: count("cancelled"),
        running: count("running"),
        per_step: perStep,
      };
    });
  });

// ---------- CSV Export ----------
export const exportReportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { type: "conversations" | "broadcasts" | "cascades"; days?: number }) =>
    z
      .object({
        type: z.enum(["conversations", "broadcasts", "cascades"]),
        days: z.number().int().min(1).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ filename: string; csv: string }> => {
    const days = data.days ?? 30;
    const stamp = new Date().toISOString().slice(0, 10);

    if (data.type === "conversations") {
      const { data: rows } = await context.supabase
        .from("conversations")
        .select(
          "id, status, created_at, last_message_at, unread_count, contact:contacts(name, phone), channel:channels!channel_id(name)",
        )
        .gte("created_at", sinceISO(days))
        .order("created_at", { ascending: false })
        .limit(5000);
      const csv = toCsv(
        ["id", "status", "criado_em", "ultima_mensagem", "nao_lidas", "contato", "telefone", "canal"],
        (rows ?? []).map((r) => [
          r.id,
          r.status,
          r.created_at,
          r.last_message_at ?? "",
          r.unread_count ?? 0,
          (r.contact as { name?: string } | null)?.name ?? "",
          (r.contact as { phone?: string } | null)?.phone ?? "",
          (r.channel as { name?: string } | null)?.name ?? "",
        ]),
      );
      return { filename: `conversas-${stamp}.csv`, csv };
    }

    if (data.type === "broadcasts") {
      const { data: rows } = await context.supabase
        .from("broadcasts")
        .select(
          "id, name, status, created_at, total_recipients, sent_count, delivered_count, read_count, failed_count, channel:channels!channel_id(name)",
        )
        .gte("created_at", sinceISO(days))
        .order("created_at", { ascending: false })
        .limit(5000);
      const csv = toCsv(
        ["id", "nome", "status", "criado_em", "canal", "destinatarios", "enviados", "entregues", "lidos", "falhas"],
        (rows ?? []).map((r) => [
          r.id,
          r.name,
          r.status,
          r.created_at,
          (r.channel as { name?: string } | null)?.name ?? "",
          r.total_recipients ?? 0,
          r.sent_count ?? 0,
          r.delivered_count ?? 0,
          r.read_count ?? 0,
          r.failed_count ?? 0,
        ]),
      );
      return { filename: `broadcasts-${stamp}.csv`, csv };
    }

    // cascades
    const { data: rows } = await context.supabase
      .from("cascade_attempts")
      .select(
        "id, run_id, step_index, channel_type, status, sent_at, created_at, error, run:cascade_runs(policy:cascade_policies(name), contact:contacts(name, phone))",
      )
      .gte("created_at", sinceISO(days))
      .order("created_at", { ascending: false })
      .limit(5000);
    const csv = toCsv(
      ["id", "criado_em", "politica", "contato", "telefone", "passo", "canal", "status", "erro"],
      (rows ?? []).map((r) => {
        const run = r.run as { policy?: { name?: string }; contact?: { name?: string; phone?: string } } | null;
        return [
          r.id,
          r.created_at,
          run?.policy?.name ?? "",
          run?.contact?.name ?? "",
          run?.contact?.phone ?? "",
          (r.step_index as number) + 1,
          r.channel_type,
          r.status,
          r.error ?? "",
        ];
      }),
    );
    return { filename: `cascatas-${stamp}.csv`, csv };
  });
