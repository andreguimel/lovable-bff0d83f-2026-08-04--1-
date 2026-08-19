/**
 * Runtime-02.2 (Wait Reply Recovery) — server-only helper.
 *
 * Given an inbound WhatsApp message that was just persisted for a
 * conversation, this locates the flow_run paused in WAITING_REPLY on that
 * conversation and resumes it. It is the single owner of the wait_reply
 * hand-off — the webhook calls it before falling back to AI auto-reply.
 *
 * Guarantees documented in the caller (whatsapp.$channelId.ts):
 *  - Only ONE run resumes per inbound message (atomic conditional UPDATE).
 *  - Idempotent by provider_message_id (FlowReplyReceived audit event).
 *  - Executor's own flow_run_acquire_lock handles worker-level concurrency.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type InboundReplyMessage = {
  provider_message_id: string | null;
  type: string;
  body: string | null;
  media_url: string | null;
  from_phone: string;
};

export type ResumeInboundResult = {
  resumed: boolean;
  runId?: string;
  reason?: "no_waiting_run" | "duplicate_message" | "lost_race" | "executor_failed";
  error?: string;
};

export async function resumeWaitingReplyForConversation(args: {
  supabase: SupabaseClient;
  companyId: string;
  channelId: string;
  conversationId: string;
  replyMessage: InboundReplyMessage;
  // Injectable for unit tests; defaults to the real executor.
  executeRun?: (input: { supabase: SupabaseClient; runId: string }) => Promise<unknown>;
}): Promise<ResumeInboundResult> {
  const {
    supabase,
    companyId,
    channelId,
    conversationId,
    replyMessage,
  } = args;

  const { data: run } = await supabase
    .from("flow_runs")
    .select("id, flow_id, variables, state")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .in("state", ["WAITING_REPLY", "WAITING"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { resumed: false, reason: "no_waiting_run" };

  const runId = (run as { id: string }).id;
  const flowId = (run as { flow_id: string }).flow_id;
  const currentState = (run as { state: string }).state;

  // Idempotency guard against Meta retries / concurrent workers.
  if (replyMessage.provider_message_id) {
    const { data: dup } = await supabase
      .from("flow_events")
      .select("id")
      .eq("run_id", runId)
      .eq("event_type", "FlowReplyReceived")
      .contains("payload", { provider_message_id: replyMessage.provider_message_id })
      .limit(1)
      .maybeSingle();
    if (dup) return { resumed: true, runId, reason: "duplicate_message" };
  }

  const currentVars = ((run as { variables: unknown }).variables ?? {}) as Record<string, unknown>;
  const replyPayload = {
    id: replyMessage.provider_message_id,
    type: replyMessage.type,
    body: replyMessage.body,
    media_url: replyMessage.media_url,
    from: replyMessage.from_phone,
    received_at: new Date().toISOString(),
  };
  const nextVars: Record<string, unknown> = {
    ...currentVars,
    reply: replyPayload,
    last_message: replyMessage.body ?? "",
    message: replyPayload,
  };

  // Atomic hand-off — only one worker flips WAITING_REPLY/WAITING → RUNNING.
  const { data: claimed } = await supabase
    .from("flow_runs")
    .update({
      variables: nextVars as never,
      state: "RUNNING" as never,
      status: "running",
    })
    .eq("id", runId)
    .eq("state", currentState)
    .select("id")
    .maybeSingle();
  if (!claimed) return { resumed: false, reason: "lost_race" };

  await supabase.from("flow_events").insert({
    run_id: runId,
    company_id: companyId,
    flow_id: flowId,
    event_type: "FlowReplyReceived",
    payload: {
      provider_message_id: replyMessage.provider_message_id,
      conversation_id: conversationId,
      channel_id: channelId,
      type: replyMessage.type,
    } as never,
  } as never);

  const runExecutor =
    args.executeRun ??
    (async ({ supabase: sb, runId: rid }) => {
      const { executeRun } = await import("@/lib/flow-executor.server");
      return executeRun({ supabase: sb, runId: rid });
    });

  try {
    await runExecutor({ supabase, runId });
    return { resumed: true, runId };
  } catch (e) {
    const message = String((e as Error).message ?? e);
    await supabase.from("flow_events").insert({
      run_id: runId,
      company_id: companyId,
      flow_id: flowId,
      event_type: "FlowResumeFailed",
      payload: { error: message } as never,
    } as never);
    await supabase
      .from("flow_runs")
      .update({
        state: "FAILED" as never,
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { resumed: true, runId, reason: "executor_failed", error: message };
  }
}
