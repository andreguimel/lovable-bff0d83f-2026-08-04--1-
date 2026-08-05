import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAndExecuteRun, executeRun } from "./flow-executor.server";

/** Start a real flow execution against a conversation (no dry-run). */
export const startFlowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      flowId: string;
      conversationId?: string;
      channelId?: string;
      variables?: Record<string, unknown>;
      idempotencyKey?: string;
    }) =>
      z
        .object({
          flowId: z.string().uuid(),
          conversationId: z.string().uuid().optional(),
          channelId: z.string().uuid().optional(),
          variables: z.record(z.string(), z.unknown()).optional(),
          idempotencyKey: z.string().max(200).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: flow } = await context.supabase
      .from("flows")
      .select("id, company_id")
      .eq("id", data.flowId)
      .maybeSingle();
    if (!flow) throw new Error("Fluxo não encontrado");

    return createAndExecuteRun({
      supabase: context.supabase as never,
      companyId: flow.company_id,
      flowId: data.flowId,
      conversationId: data.conversationId ?? null,
      channelId: data.channelId ?? null,
      variables: data.variables,
      idempotencyKey: data.idempotencyKey,
      triggerType: "manual",
    });
  });

/** Resume a paused (WAITING_*) flow run. */
export const resumeFlowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string; replyPayload?: Record<string, unknown> }) =>
    z
      .object({
        runId: z.string().uuid(),
        replyPayload: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.replyPayload) {
      const { data: run } = await context.supabase
        .from("flow_runs")
        .select("variables")
        .eq("id", data.runId)
        .maybeSingle();
      const vars = { ...((run?.variables ?? {}) as Record<string, unknown>), reply: data.replyPayload };
      await context.supabase
        .from("flow_runs")
        .update({ variables: vars as never, state: "RUNNING" as never })
        .eq("id", data.runId);
    }
    return executeRun({ supabase: context.supabase as never, runId: data.runId });
  });

/** Cancel a run. */
export const cancelFlowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("flow_runs")
      .update({
        state: "CANCELLED" as never,
        status: "failed",
        error: "Cancelado pelo operador",
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.runId);
    return { ok: true };
  });

/** Load step timeline + events for a run. */
export const getFlowRunTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: run }, { data: steps }, { data: events }] = await Promise.all([
      context.supabase.from("flow_runs").select("*").eq("id", data.runId).maybeSingle(),
      context.supabase
        .from("flow_run_steps")
        .select("*")
        .eq("run_id", data.runId)
        .order("seq", { ascending: true }),
      context.supabase
        .from("flow_events")
        .select("event_type, payload, node_id, created_at")
        .eq("run_id", data.runId)
        .order("created_at", { ascending: true }),
    ]);
    if (!run) throw new Error("Execução não encontrada");
    return {
      run,
      steps: steps ?? [],
      events: events ?? [],
    };
  });

/** Requeue a dead-letter row (admin only). */
export const requeueDeadLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deadLetterId: string }) =>
    z.object({ deadLetterId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: dlq } = await context.supabase
      .from("flow_dead_letter")
      .select("run_id, node_id")
      .eq("id", data.deadLetterId)
      .maybeSingle();
    if (!dlq) throw new Error("Item não encontrado");
    await context.supabase
      .from("flow_runs")
      .update({
        state: "RUNNING" as never,
        status: "running",
        cursor_node_id: (dlq as { node_id: string | null }).node_id,
        retry_count: 0 as never,
        error: null,
      })
      .eq("id", (dlq as { run_id: string }).run_id);
    await context.supabase
      .from("flow_dead_letter")
      .update({ status: "requeued", resolved_at: new Date().toISOString() })
      .eq("id", data.deadLetterId);
    return executeRun({ supabase: context.supabase as never, runId: (dlq as { run_id: string }).run_id });
  });
