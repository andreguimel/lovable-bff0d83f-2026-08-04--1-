import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Types ----------
const stepSchema = z.object({
  channel_type: z.enum(["whatsapp", "email", "sms"]),
  wait_minutes: z.number().int().min(0).max(60 * 24 * 30),
  message: z.string().min(1).max(4000),
  subject: z.string().max(200).optional(),
});
const stepsSchema = z.array(stepSchema).min(1).max(10);

export type CascadeStep = z.infer<typeof stepSchema>;

// ---------- Policies CRUD ----------
export const listCascadePolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cascade_policies")
      .select("id, name, description, steps, active, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCascadePolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cascade_policies")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Política não encontrada");
    return row;
  });

export const createCascadePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; description?: string; steps: CascadeStep[]; active?: boolean }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        steps: stepsSchema,
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa não encontrada");

    const { data: row, error } = await context.supabase
      .from("cascade_policies")
      .insert({
        company_id: profile.company_id,
        name: data.name,
        description: data.description ?? null,
        steps: data.steps,
        active: data.active ?? true,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateCascadePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      name?: string;
      description?: string | null;
      steps?: CascadeStep[];
      active?: boolean;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(1).max(120).optional(),
          description: z.string().max(500).nullable().optional(),
          steps: stepsSchema.optional(),
          active: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      name?: string;
      description?: string | null;
      steps?: CascadeStep[];
      active?: boolean;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.steps !== undefined) patch.steps = data.steps;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await context.supabase
      .from("cascade_policies")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCascadePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cascade_policies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Run start / advance / cancel ----------
export const startCascadeRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { policyId: string; contactId: string; conversationId?: string }) =>
    z
      .object({
        policyId: z.string().uuid(),
        contactId: z.string().uuid(),
        conversationId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: policy, error: perr } = await context.supabase
      .from("cascade_policies")
      .select("id, company_id, name, steps, active")
      .eq("id", data.policyId)
      .maybeSingle();
    if (perr || !policy) throw new Error("Política não encontrada");
    if (!policy.active) throw new Error("Política inativa");
    const steps = policy.steps as CascadeStep[] | null;
    if (!steps || steps.length === 0) throw new Error("Política sem passos");

    const { data: run, error } = await context.supabase
      .from("cascade_runs")
      .insert({
        company_id: policy.company_id,
        policy_id: policy.id,
        contact_id: data.contactId,
        conversation_id: data.conversationId ?? null,
        status: "running",
        current_step: 0,
        run_at: new Date().toISOString(),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("channel_events").insert({
      company_id: policy.company_id,
      channel_id: await pickAnyChannelId(context.supabase, policy.company_id),
      contact_id: data.contactId,
      conversation_id: data.conversationId ?? null,
      event_type: "cascade_started",
      payload: { policy_id: policy.id, policy_name: policy.name, run_id: run.id, steps: steps.length },
    });

    // Executa passo 0 imediatamente
    await executeStep(context.supabase, run.id);
    return { runId: run.id };
  });

export const cancelCascadeRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: run } = await context.supabase
      .from("cascade_runs")
      .select("company_id, contact_id, conversation_id, policy_id")
      .eq("id", data.runId)
      .maybeSingle();
    if (!run) throw new Error("Execução não encontrada");
    await context.supabase
      .from("cascade_runs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.runId);
    await context.supabase.from("channel_events").insert({
      company_id: run.company_id,
      channel_id: await pickAnyChannelId(context.supabase, run.company_id),
      contact_id: run.contact_id,
      conversation_id: run.conversation_id,
      event_type: "cascade_cancelled",
      payload: { run_id: data.runId, policy_id: run.policy_id },
    });
    return { ok: true };
  });

export const listCascadeRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string } | undefined) =>
    z.object({ status: z.string().optional() }).optional().parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("cascade_runs")
      .select(
        "id, status, current_step, run_at, started_at, completed_at, last_error, contact:contacts(id, name, email, phone), policy:cascade_policies(id, name, steps)",
      )
      .order("started_at", { ascending: false })
      .limit(200);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Helpers ----------
// Use a permissive client type — the concrete Supabase client typing depends on
// middleware internals that shift between versions.
type SupabaseClient = any;

async function pickAnyChannelId(sb: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await sb
    .from("channels")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Nenhum canal cadastrado — crie um canal antes de usar cascatas.");
  return data.id;
}

/**
 * Executa o passo corrente de uma cascata.
 *
 * ZENDA CORE ALIGNMENT 01 — Onda 3:
 *  - CROSS-CHANNEL: cada tentativa escolhe um canal WhatsApp ainda não utilizado
 *    dentro desta run (round-robin implícito por cascade_attempts.channel_id).
 *  - STOP-ON-REPLY: se `stopped_by_reply_at` foi marcado (pelo webhook), aborta.
 *  - RACE SAFETY: quando chamado pelo cron, usa cascade_run_claim (lock TTL).
 *  - IDEMPOTÊNCIA: UNIQUE (run_id, step_index) em cascade_attempts impede dupla
 *    execução do mesmo passo mesmo em corrida.
 *  - RASTREABILIDADE: mensagens outbound recebem cascade_run_id e channel_id.
 */
async function executeStep(sb: SupabaseClient, runId: string) {
  const { data: run } = await sb
    .from("cascade_runs")
    .select(
      "id, company_id, policy_id, contact_id, conversation_id, current_step, status, stopped_by_reply_at, policy:cascade_policies(steps, name)",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!run) return;
  if (run.status !== "running") return;

  // STOP-ON-REPLY: interrompe se cliente já respondeu
  if (run.stopped_by_reply_at) {
    await sb
      .from("cascade_runs")
      .update({ status: "stopped_by_reply", completed_at: new Date().toISOString(), lock_token: null, lock_expires_at: null })
      .eq("id", runId);
    return;
  }

  const steps = ((run.policy as { steps?: CascadeStep[] } | null)?.steps ?? []) as CascadeStep[];
  const stepIdx = run.current_step;
  const step = steps[stepIdx];
  if (!step) {
    await sb
      .from("cascade_runs")
      .update({ status: "exhausted", completed_at: new Date().toISOString(), lock_token: null, lock_expires_at: null })
      .eq("id", runId);
    await sb.from("channel_events").insert({
      company_id: run.company_id,
      channel_id: await pickAnyChannelId(sb, run.company_id).catch(() => null),
      contact_id: run.contact_id,
      conversation_id: run.conversation_id,
      event_type: "cascade_completed",
      payload: { run_id: runId, exhausted: true },
    });
    return;
  }

  const { data: contact } = await sb
    .from("contacts")
    .select("id, name, phone, phone_canonical, email")
    .eq("id", run.contact_id)
    .maybeSingle();
  if (!contact) return;

  let status: "sent" | "failed" | "skipped" = "skipped";
  let error: string | null = null;
  let providerId: string | null = null;
  let usedChannelId: string | null = null;

  try {
    if (step.channel_type === "email") {
      if (!contact.email) {
        status = "skipped";
        error = "Contato sem e-mail";
      } else {
        let resendKey = process.env.RESEND_API_KEY;
        let fromEmail = process.env.RESEND_FROM_EMAIL;

        if (run.company_id) {
          const { data: dbResend } = await sb
            .from("integrations")
            .select("credentials, config")
            .eq("company_id", run.company_id)
            .eq("provider", "resend")
            .eq("enabled", true)
            .maybeSingle();
          if (dbResend) {
            const creds = (dbResend.credentials ?? {}) as Record<string, string>;
            const conf = (dbResend.config ?? {}) as Record<string, string>;
            if (creds.api_key) resendKey = creds.api_key;
            if (conf.from_email) fromEmail = conf.from_email;
          }
        }

        if (!resendKey || !fromEmail) {
          status = "skipped";
          error = "Resend não configurado";
        } else {
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [contact.email],
              subject: renderTemplate(step.subject || "Retomando nosso contato", contact),
              text: renderTemplate(step.message, contact),
            }),
          });
          if (!resendRes.ok) {
            const raw = await resendRes.text();
            status = "failed";
            error = `Resend ${resendRes.status}: ${raw.slice(0, 150)}`;
          } else {
            const j = (await resendRes.json()) as { id?: string };
            providerId = j.id ?? null;
            status = "sent";
          }
        }
      }
    } else if (step.channel_type === "whatsapp") {
      // CROSS-CHANNEL: escolher um canal WA ainda não usado nesta run
      const picked = await pickNextUnusedWhatsAppChannel(sb, run.company_id, runId);
      if (!picked) {
        status = "skipped";
        error = "Sem canais WhatsApp disponíveis (ou todos já foram usados nesta cascata)";
      } else if (!run.conversation_id) {
        status = "skipped";
        error = "Sem conversa vinculada à execução";
      } else {
        usedChannelId = picked.id;
        const rendered = renderTemplate(step.message, contact);

        // Envio real via provider (best-effort; retorna skipped sem credenciais)
        let providerSendId: string | null = null;
        let sendError: string | null = null;
        const toPhoneRaw = contact.phone_canonical ?? contact.phone ?? "";
        const toPhone = toPhoneRaw.replace(/^\+/, "").replace(/\D/g, "");
        if (toPhone) {
          try {
            const { dispatchSend } = await import("@/lib/wa-providers/index.server");
            const res = await dispatchSend(
              {
                id: picked.id,
                provider_type: picked.provider_type,
                credentials: (picked.credentials ?? {}) as Record<string, unknown>,
                phone_number: picked.phone_number,
              },
              { type: "text", to: toPhone, body: rendered },
            );
            if (res.ok) providerSendId = res.provider_message_id;
            else sendError = res.error;
          } catch (e) {
            sendError = e instanceof Error ? e.message : String(e);
          }
        }

        const { data: msg, error: mErr } = await sb
          .from("messages")
          .insert({
            company_id: run.company_id,
            conversation_id: run.conversation_id,
            channel_id: picked.id,
            cascade_run_id: runId,
            direction: "outbound",
            type: "text",
            body: rendered,
            provider_message_id: providerSendId,
            status: sendError ? "failed" : "sent",
            media_metadata: {
              cascade_step_index: stepIdx,
              channel_phone: picked.phone_number,
              ...(sendError ? { send_error: sendError } : {}),
            },
          })
          .select("id")
          .single();
        if (mErr) {
          status = "failed";
          error = mErr.message;
        } else {
          providerId = providerSendId ?? msg.id;
          status = sendError ? "failed" : "sent";
          error = sendError;
          await sb
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: rendered.slice(0, 120),
            })
            .eq("id", run.conversation_id);
        }
      }
    } else if (step.channel_type === "sms") {
      status = "skipped";
      error = "SMS ainda não configurado";
    }
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  // Idempotência via UNIQUE (run_id, step_index): se outro worker já registrou,
  // o INSERT falha silenciosamente e não avançamos o passo.
  const { error: attemptErr } = await sb.from("cascade_attempts").insert({
    company_id: run.company_id,
    run_id: runId,
    step_index: stepIdx,
    channel_type: step.channel_type,
    channel_id: usedChannelId,
    status,
    provider_message_id: providerId,
    error,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  });
  if (attemptErr) {
    // Já executado por outro worker — release lock e retorna
    await sb.from("cascade_runs").update({ lock_token: null, lock_expires_at: null }).eq("id", runId);
    return;
  }

  await sb.from("channel_events").insert({
    company_id: run.company_id,
    channel_id: usedChannelId ?? (await pickAnyChannelId(sb, run.company_id).catch(() => null)),
    contact_id: run.contact_id,
    conversation_id: run.conversation_id,
    event_type: "cascade_step_sent",
    payload: {
      run_id: runId,
      step_index: stepIdx,
      channel_type: step.channel_type,
      channel_id: usedChannelId,
      status,
      error,
    },
  });

  // Re-check stop-on-reply antes de agendar próximo passo
  const { data: freshRun } = await sb
    .from("cascade_runs")
    .select("stopped_by_reply_at, status")
    .eq("id", runId)
    .maybeSingle();
  if (freshRun?.stopped_by_reply_at || freshRun?.status !== "running") {
    await sb
      .from("cascade_runs")
      .update({
        status: freshRun?.stopped_by_reply_at ? "stopped_by_reply" : (freshRun?.status ?? "stopped_by_reply"),
        completed_at: new Date().toISOString(),
        lock_token: null,
        lock_expires_at: null,
      })
      .eq("id", runId);
    return;
  }

  const next = steps[stepIdx + 1];
  if (!next) {
    await sb
      .from("cascade_runs")
      .update({
        status: "exhausted",
        completed_at: new Date().toISOString(),
        last_error: error,
        lock_token: null,
        lock_expires_at: null,
      })
      .eq("id", runId);
    await sb.from("channel_events").insert({
      company_id: run.company_id,
      channel_id: usedChannelId ?? (await pickAnyChannelId(sb, run.company_id).catch(() => null)),
      contact_id: run.contact_id,
      conversation_id: run.conversation_id,
      event_type: "cascade_completed",
      payload: { run_id: runId },
    });
  } else {
    const nextAt = new Date(Date.now() + next.wait_minutes * 60 * 1000).toISOString();
    await sb
      .from("cascade_runs")
      .update({
        current_step: stepIdx + 1,
        run_at: nextAt,
        last_error: error,
        lock_token: null,
        lock_expires_at: null,
      })
      .eq("id", runId);
  }
}

async function pickNextUnusedWhatsAppChannel(
  sb: SupabaseClient,
  companyId: string,
  runId: string,
): Promise<{ id: string; provider_type: string | null; credentials: unknown; phone_number: string | null } | null> {
  const { data: channels } = await sb
    .from("channels")
    .select("id, provider_type, credentials, phone_number, status")
    .eq("company_id", companyId)
    .in("provider_type", ["whatsapp_cloud", "whatsapp_business", "baileys", "evolution"]);
  if (!channels || channels.length === 0) return null;

  const { data: usedRows } = await sb
    .from("cascade_attempts")
    .select("channel_id")
    .eq("run_id", runId)
    .not("channel_id", "is", null);
  const used = new Set((usedRows ?? []).map((r: { channel_id: string }) => r.channel_id));

  // Prefer canal não usado; se todos foram usados, retorna o primeiro (fallback)
  const unused = channels.find((c: { id: string }) => !used.has(c.id));
  return (unused ?? channels[0]) as {
    id: string;
    provider_type: string | null;
    credentials: unknown;
    phone_number: string | null;
  };
}

function renderTemplate(tpl: string, contact: { name?: string | null; email?: string | null; phone?: string | null }) {
  return tpl
    .replace(/\{\{\s*nome\s*\}\}/gi, contact.name ?? "")
    .replace(/\{\{\s*email\s*\}\}/gi, contact.email ?? "")
    .replace(/\{\{\s*telefone\s*\}\}/gi, contact.phone ?? "");
}

// Exposto para o cron público (server-only)
export { executeStep as _executeCascadeStep };
