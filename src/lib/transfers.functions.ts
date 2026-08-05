import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- List target channels for transfer ----
export const listTransferTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: conv, error: convErr } = await context.supabase
      .from("conversations")
      .select("id, channel_id, company_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversa não encontrada");

    const { data: channels, error } = await context.supabase
      .from("channels")
      .select("id, name, phone_number, status, paused_at, color, default_welcome_flow_id")
      .eq("company_id", conv.company_id)
      .is("archived_at", null)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    return {
      currentChannelId: conv.channel_id,
      channels: (channels ?? []).filter((c) => c.id !== conv.channel_id),
    };
  });

// ---- List flows available (active) ----
export const listActiveFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("flows")
      .select("id, name, status")
      .eq("status", "active")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const flows = data ?? [];
    if (flows.length === 0) return [];

    const { data: versions, error: versionErr } = await context.supabase
      .from("flow_versions")
      .select("flow_id")
      .in("flow_id", flows.map((flow) => flow.id))
      .eq("status", "published");
    if (versionErr) throw new Error(versionErr.message);

    const publishedFlowIds = new Set((versions ?? []).map((version) => version.flow_id));
    return flows.filter((flow) => publishedFlowIds.has(flow.id));
  });

// ---- Preview flow messages (first N text/message nodes) ----
export const previewFlowMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string; limit?: number }) =>
    z.object({ flowId: z.string().uuid(), limit: z.number().int().min(1).max(10).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: nodes }, { data: edges }] = await Promise.all([
      context.supabase
        .from("flow_nodes")
        .select("id, node_type, data, created_at")
        .eq("flow_id", data.flowId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("flow_edges")
        .select("source_node_id, target_node_id")
        .eq("flow_id", data.flowId),
    ]);
    const ordered = orderFlowNodes(nodes ?? [], edges ?? []);
    const previews: string[] = [];
    const limit = data.limit ?? 3;
    for (const n of ordered) {
      if (n.node_type !== "message" && n.node_type !== "send_message") continue;
      const d = (n.data ?? {}) as { body?: string; text?: string; message?: string };
      const body = d.body ?? d.text ?? d.message ?? "";
      if (body) previews.push(body);
      if (previews.length >= limit) break;
    }
    return { previews, hasMore: ordered.filter((n) => n.node_type === "message" || n.node_type === "send_message").length > previews.length };
  });

// ---- Transfer conversation to another channel and trigger a flow ----
export const transferConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      toChannelId: string;
      flowId?: string | null;
      note?: string | null;
    }) =>
      z
        .object({
          conversationId: z.string().uuid(),
          toChannelId: z.string().uuid(),
          flowId: z.string().uuid().nullable().optional(),
          note: z.string().max(1000).nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context.userId) throw new Error("Sessão inválida");

    // 1) Load conversation
    const { data: conv, error: convErr } = await context.supabase
      .from("conversations")
      .select("id, company_id, channel_id, contact_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("Conversa não encontrada");
    if (conv.channel_id === data.toChannelId)
      throw new Error("Selecione um canal diferente do atual");

    // 2) Validate destination channel (same tenant, not paused)
    const { data: target, error: tErr } = await context.supabase
      .from("channels")
      .select("id, name, status, paused_at, default_welcome_flow_id, company_id")
      .eq("id", data.toChannelId)
      .maybeSingle();
    if (tErr || !target) throw new Error("Canal de destino não encontrado");
    if (target.company_id !== conv.company_id)
      throw new Error("Canal de destino não pertence à sua empresa");
    if (target.paused_at) throw new Error("Canal de destino está pausado");

    // 3) Source channel name (for event payload)
    const { data: source } = conv.channel_id
      ? await context.supabase
          .from("channels")
          .select("id, name")
          .eq("id", conv.channel_id)
          .maybeSingle()
      : { data: null as { id: string; name: string } | null };

    const now = new Date().toISOString();
    const flowId = data.flowId ?? target.default_welcome_flow_id ?? null;

    // 4) Validate flow tenant (if any)
    let flowName: string | null = null;
    if (flowId) {
      const { data: flow, error: fErr } = await context.supabase
        .from("flows")
        .select("id, name, company_id")
        .eq("id", flowId)
        .maybeSingle();
      if (fErr || !flow) throw new Error("Fluxo selecionado não encontrado");
      if (flow.company_id !== conv.company_id)
        throw new Error("Fluxo não pertence à sua empresa");
      flowName = flow.name;
    }

    // 5) Update conversation
    const { error: uErr } = await context.supabase
      .from("conversations")
      .update({
        channel_id: data.toChannelId,
        transferred_from_channel_id: conv.channel_id,
        transferred_at: now,
        status: "open",
      })
      .eq("id", data.conversationId);
    if (uErr) throw new Error(uErr.message);

    // 6) Log transfer (audit)
    const { error: logErr } = await context.supabase.from("conversation_transfers").insert({
      company_id: conv.company_id,
      conversation_id: data.conversationId,
      from_channel_id: conv.channel_id,
      to_channel_id: data.toChannelId,
      flow_id: flowId,
      transferred_by: context.userId,
      note: data.note ?? null,
    });
    if (logErr) throw new Error(logErr.message);

    // 7) Timeline event (appears in contact history + realtime)
    await context.supabase.from("channel_events").insert({
      company_id: conv.company_id,
      channel_id: data.toChannelId,
      contact_id: conv.contact_id,
      conversation_id: data.conversationId,
      event_type: "conversation_transferred",
      payload: {
        from_channel_id: conv.channel_id,
        from_channel_name: source?.name ?? null,
        to_channel_id: data.toChannelId,
        to_channel_name: target.name,
        flow_id: flowId,
        flow_name: flowName,
        note: data.note ?? null,
        transferred_by: context.userId,
      },
    });

    // 8) Execute flow through the same runtime resolver used by Inbox/manual runs
    let flowRunId: string | null = null;
    let messagesSent = 0;

    if (flowId) {
      try {
        console.info("[FLOW_RUNTIME_AUDIT] TransferRunFlowRequested", {
          function: "transferConversation",
          conversation_id: data.conversationId,
          flow_id: flowId,
          flow_version_id: null,
          trigger_id: null,
          user_id: context.userId,
          company_id: conv.company_id,
          from_channel_id: conv.channel_id,
          to_channel_id: data.toChannelId,
        });
        const { createAndExecuteRun } = await import("@/lib/flow-executor.server");
        const result = await createAndExecuteRun({
          supabase: context.supabase as never,
          companyId: conv.company_id,
          flowId,
          conversationId: data.conversationId,
          channelId: data.toChannelId,
          triggerType: "transfer",
          triggerPayload: {
            from_channel_id: conv.channel_id,
            to_channel_id: data.toChannelId,
            transferred_by: context.userId,
          },
        });
        flowRunId = result.runId;
        messagesSent = result.messagesSent;
        if (result.state === "FAILED") throw new Error(result.error ?? "Execução falhou");

        // Timeline event: flow finished
        await context.supabase.from("channel_events").insert({
          company_id: conv.company_id,
          channel_id: data.toChannelId,
          contact_id: conv.contact_id,
          conversation_id: data.conversationId,
          event_type: "flow_run_completed",
          payload: {
            flow_id: flowId,
            flow_name: flowName,
            flow_run_id: flowRunId,
            messages_sent: messagesSent,
          },
        });

        // Bump flow counter
        const { data: flowRow } = await context.supabase
          .from("flows")
          .select("runs_count")
          .eq("id", flowId)
          .maybeSingle();
        if (flowRow) {
          await context.supabase
            .from("flows")
            .update({ runs_count: (flowRow.runs_count ?? 0) + 1 })
            .eq("id", flowId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (flowRunId) {
          await context.supabase
            .from("flow_runs")
            .update({
              status: "failed",
              error: msg,
              messages_sent: messagesSent,
              completed_at: new Date().toISOString(),
            })
            .eq("id", flowRunId);
        }
        throw new Error(msg);
      }
    }

    return {
      ok: true,
      flowRunId,
      messagesSent,
      fromChannelId: conv.channel_id,
      toChannelId: data.toChannelId,
    };
  });

// ---- List transfers for a conversation (audit view) ----
export const listConversationTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("conversation_transfers")
      .select(
        "id, created_at, note, flow_id, from_channel:channels!from_channel_id(id, name), to_channel:channels!to_channel_id(id, name), flow:flows(id, name)",
      )
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---- helpers ----
type FlowNodeRow = {
  id: string;
  node_type: string;
  data: unknown;
  created_at: string;
};
type FlowEdgeRow = { source_node_id: string; target_node_id: string };

function orderFlowNodes(nodes: FlowNodeRow[], edges: FlowEdgeRow[]): FlowNodeRow[] {
  if (nodes.length === 0) return [];
  if (edges.length === 0) return nodes;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const targets = new Set(edges.map((e) => e.target_node_id));
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source_node_id)) outgoing.set(e.source_node_id, []);
    outgoing.get(e.source_node_id)!.push(e.target_node_id);
  }
  // roots = nodes that are never a target
  const roots = nodes.filter((n) => !targets.has(n.id));
  const start = roots[0] ?? nodes[0];

  const visited = new Set<string>();
  const out: FlowNodeRow[] = [];
  const queue: string[] = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node) out.push(node);
    for (const next of outgoing.get(id) ?? []) queue.push(next);
  }
  // Include any orphan nodes at the end (by created_at)
  for (const n of nodes) if (!visited.has(n.id)) out.push(n);
  return out;
}
