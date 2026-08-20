import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { validateGraphForPublish } from "./flow-executor.server";

async function getCompanyId(supabase: {
  from: (t: string) => {
    select: (s: string) => {
      eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { company_id: string } | null }> };
    };
  };
}, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Empresa não encontrada.");
  return data.company_id;
}


// ---- List flows with basic metrics ----
export const listFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: flows, error } = await context.supabase
      .from("flows")
      .select("id, name, description, status, trigger_type, runs_count, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!flows || flows.length === 0) return [];

    const ids = flows.map((f) => f.id);
    const { data: runs } = await context.supabase
      .from("flow_runs")
      .select("flow_id, status, messages_sent, started_at")
      .in("flow_id", ids)
      .order("started_at", { ascending: false })
      .limit(500);

    const agg = new Map<
      string,
      { total: number; completed: number; failed: number; lastAt: string | null; lastStatus: string | null }
    >();
    for (const r of runs ?? []) {
      const key = r.flow_id;
      const cur = agg.get(key) ?? { total: 0, completed: 0, failed: 0, lastAt: null, lastStatus: null };
      cur.total += 1;
      if (r.status === "completed") cur.completed += 1;
      if (r.status === "failed") cur.failed += 1;
      if (!cur.lastAt) {
        cur.lastAt = r.started_at;
        cur.lastStatus = r.status;
      }
      agg.set(key, cur);
    }

    return flows.map((f) => {
      const a = agg.get(f.id);
      const total = a?.total ?? 0;
      const successRate = total > 0 ? Math.round(((a!.completed) / total) * 100) : null;
      return {
        ...f,
        last_run_at: a?.lastAt ?? null,
        last_run_status: a?.lastStatus ?? null,
        success_rate: successRate,
        total_runs_recent: total,
      };
    });
  });

// ---- List runs of a single flow ----
export const listFlowRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string; limit?: number }) =>
    z.object({ flowId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: flow } = await context.supabase
      .from("flows")
      .select("id, name, status, description")
      .eq("id", data.flowId)
      .maybeSingle();
    if (!flow) throw new Error("Fluxo não encontrado");

    const { data: runs, error } = await context.supabase
      .from("flow_runs")
      .select(
        "id, status, messages_sent, error, started_at, completed_at, conversation:conversations(id, contact:contacts(id, name)), channel:channels(id, name)",
      )
      .eq("flow_id", data.flowId)
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);

    return { flow, runs: runs ?? [] };
  });

// ---- Update flow status with validation ----
export const setFlowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string; status: "active" | "draft" | "archived" }) =>
    z
      .object({
        flowId: z.string().uuid(),
        status: z.enum(["active", "draft", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.status === "active") {
      const { data: nodes } = await context.supabase
        .from("flow_nodes")
        .select("node_type, data")
        .eq("flow_id", data.flowId);
      const hasMessage = (nodes ?? []).some((n) => {
        if (n.node_type.startsWith("send_")) {
          const d = (n.data ?? {}) as { media_url?: string };
          return !!d.media_url;
        }
        if (n.node_type !== "message" && n.node_type !== "send_message") return false;
        const d = (n.data ?? {}) as { body?: string; text?: string; message?: string };
        return !!(d.body ?? d.text ?? d.message);
      });
      if (!hasMessage) {
        throw new Error(
          "Adicione pelo menos uma mensagem com conteúdo antes de ativar o fluxo.",
        );
      }

      // CRITICAL-01 P2: Grafo precisa ter todos os nós-folha como `end`, senão
      // o runtime completa "no meio" e o operador percebe como interrupção.
      const [{ data: liveNodes }, { data: liveEdges }] = await Promise.all([
        context.supabase.from("flow_nodes").select("id, node_type, data, company_id").eq("flow_id", data.flowId),
        context.supabase
          .from("flow_edges")
          .select("source_node_id, target_node_id, source_handle")
          .eq("flow_id", data.flowId),
      ]);
      const graphCheck = validateGraphForPublish(
        (liveNodes ?? []) as never,
        (liveEdges ?? []) as never,
      );
      if (!graphCheck.ok) {
        throw new Error(graphCheck.error);
      }

      // CRITICAL-01 P1: Se não houver versão publicada, auto-publica automaticamente!
      const { data: pub, error: pubErr } = await context.supabase
        .from("flow_versions")
        .select("id")
        .eq("flow_id", data.flowId)
        .eq("status", "published")
        .limit(1)
        .maybeSingle();
      if (pubErr) throw new Error(pubErr.message);

      if (!pub) {
        const snapshot = await buildSnapshot(context.supabase, data.flowId);
        const hash = await sha256Hex(stableStringify(snapshot));
        const { data: nextNumber } = await context.supabase.rpc(
          "next_flow_version_number",
          { _flow_id: data.flowId },
        );
        const now = new Date().toISOString();
        const companyId = (liveNodes?.[0]?.company_id as string) || (await getCompanyId(context.supabase as never, context.userId));
        await context.supabase.from("flow_versions").insert({
          flow_id: data.flowId,
          company_id: companyId,
          version_number: (nextNumber as number) ?? 1,
          description: "Publicação automática ao ativar fluxo",
          snapshot: snapshot as unknown as Json,
          integrity_hash: hash,
          status: "published",
          published_at: now,
        });
      }
    }
    const { error } = await context.supabase
      .from("flows")
      .update({ status: data.status })
      .eq("id", data.flowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Load a flow's full graph (nodes + edges + meta) ----
export const getFlowGraph = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string }) =>
    z.object({ flowId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: flow, error: fErr } = await context.supabase
      .from("flows")
      .select("id, name, description, status, trigger_type, trigger_config")
      .eq("id", data.flowId)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!flow) throw new Error("Fluxo não encontrado");

    const [{ data: nodes }, { data: edges }] = await Promise.all([
      context.supabase
        .from("flow_nodes")
        .select("id, node_type, position, data")
        .eq("flow_id", data.flowId),
      context.supabase
        .from("flow_edges")
        .select("id, source_node_id, target_node_id, source_handle, label, transition_delay_ms")
        .eq("flow_id", data.flowId),
    ]);

    // Diferença entre o grafo ao vivo e a última versão publicada.
    // O runtime executa SEMPRE a versão publicada — sem este sinal o autor
    // edita, vê "Salvo" e continua rodando o fluxo antigo no Inbox.
    let hasUnpublishedChanges = false;
    let publishedVersionNumber: number | null = null;
    try {
      const { data: pub } = await context.supabase
        .from("flow_versions")
        .select("integrity_hash, version_number")
        .eq("flow_id", data.flowId)
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pub) {
        publishedVersionNumber = (pub as { version_number: number }).version_number ?? null;
        const liveHash = await sha256Hex(
          stableStringify(await buildSnapshot(context.supabase, data.flowId)),
        );
        hasUnpublishedChanges = liveHash !== (pub as { integrity_hash: string }).integrity_hash;
      } else {
        hasUnpublishedChanges = true;
      }
    } catch {
      hasUnpublishedChanges = false;
    }

    return {
      flow,
      nodes: nodes ?? [],
      edges: edges ?? [],
      hasUnpublishedChanges,
      publishedVersionNumber,
    };
  });


// ---- Save (full replace) a flow's graph ----
// FB-12.1 · fonte canônica única. NÃO redeclarar aqui — sempre derivar
// de blocks/kinds.ts. Um teste anti-regressão garante paridade entre
// UI, Runtime e Persistência.
import { PERSISTABLE_NODE_KINDS } from "@/features/flow-builder/blocks/kinds";
const VALID_NODE_KINDS = PERSISTABLE_NODE_KINDS;

const nodeInput = z.object({
  id: z.string().uuid(),
  node_type: z.enum(VALID_NODE_KINDS),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()).default({}),
});
const edgeInput = z.object({
  id: z.string().uuid(),
  source_node_id: z.string().uuid(),
  target_node_id: z.string().uuid(),
  source_handle: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  // FB-V1.2 · Smart Transition Delay — atraso em ms por aresta.
  transition_delay_ms: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000).optional(),
});

export const saveFlowGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      flowId: string;
      nodes: Array<z.infer<typeof nodeInput>>;
      edges: Array<z.infer<typeof edgeInput>>;
    }) =>
      z
        .object({
          flowId: z.string().uuid(),
          nodes: z.array(nodeInput).max(500),
          edges: z.array(edgeInput).max(1000),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: flow, error: fErr } = await context.supabase
      .from("flows")
      .select("id, company_id")
      .eq("id", data.flowId)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!flow) throw new Error("Fluxo não encontrado");

    // Full replace strategy — simple and safe for small graphs.
    const delEdges = await context.supabase
      .from("flow_edges")
      .delete()
      .eq("flow_id", data.flowId);
    if (delEdges.error) throw new Error(delEdges.error.message);
    const delNodes = await context.supabase
      .from("flow_nodes")
      .delete()
      .eq("flow_id", data.flowId);
    if (delNodes.error) throw new Error(delNodes.error.message);

    if (data.nodes.length > 0) {
      const insNodes = await context.supabase.from("flow_nodes").insert(
        data.nodes.map((n) => ({
          id: n.id,
          flow_id: data.flowId,
          company_id: flow.company_id,
          node_type: n.node_type,
          position: n.position as unknown as import("@/integrations/supabase/types").Json,
          data: n.data as unknown as import("@/integrations/supabase/types").Json,
        })),
      );
      if (insNodes.error) throw new Error(insNodes.error.message);
    }

    if (data.edges.length > 0) {
      const insEdges = await context.supabase.from("flow_edges").insert(
        data.edges.map((e) => ({
          id: e.id,
          flow_id: data.flowId,
          company_id: flow.company_id,
          source_node_id: e.source_node_id,
          target_node_id: e.target_node_id,
          source_handle: e.source_handle ?? null,
          label: e.label ?? null,
          transition_delay_ms: Math.max(0, Math.floor(e.transition_delay_ms ?? 0)),
        })) as never,
      );
      if (insEdges.error) throw new Error(insEdges.error.message);
    }

    await context.supabase
      .from("flows")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.flowId);

    return { ok: true, nodes: data.nodes.length, edges: data.edges.length };
  });

// ---- Create a new flow (with an initial start node) ----
export const createFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; description?: string; triggerType?: string }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        triggerType: z
          .enum(["manual", "inbound_message", "keyword", "transfer", "new_contact"])
          .default("manual"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const companyId = await getCompanyId(context.supabase as never, context.userId);
    const { data: flow, error } = await context.supabase
      .from("flows")
      .insert({
        company_id: companyId,
        name: data.name,
        description: data.description ?? null,
        status: "draft",
        trigger_type: data.triggerType as never,
        trigger_config: {} as Json,
      })
      .select("id")
      .single();
    if (error || !flow) throw new Error(error?.message ?? "Falha ao criar fluxo");

    // Seed with a start node
    await context.supabase.from("flow_nodes").insert({
      flow_id: flow.id,
      company_id: companyId,
      node_type: "start",
      position: { x: 0, y: 0 } as Json,
      data: { label: "Início" } as Json,
    });

    return { id: flow.id };
  });

// ---- Delete a flow (cascade nodes/edges/runs) ----
export const deleteFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string }) =>
    z.object({ flowId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Delete children first (in case FK doesn't cascade)
    await context.supabase.from("flow_runs").delete().eq("flow_id", data.flowId);
    await context.supabase.from("flow_edges").delete().eq("flow_id", data.flowId);
    await context.supabase.from("flow_nodes").delete().eq("flow_id", data.flowId);
    const { error } = await context.supabase.from("flows").delete().eq("id", data.flowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Duplicate a flow ----
export const duplicateFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string; name?: string }) =>
    z.object({ flowId: z.string().uuid(), name: z.string().min(1).max(120).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: src } = await context.supabase
      .from("flows")
      .select("company_id, name, description, trigger_type, trigger_config")
      .eq("id", data.flowId)
      .maybeSingle();
    if (!src) throw new Error("Fluxo não encontrado");

    const { data: created, error } = await context.supabase
      .from("flows")
      .insert({
        company_id: src.company_id,
        name: data.name ?? `${src.name} (cópia)`,
        description: src.description,
        status: "draft",
        trigger_type: src.trigger_type,
        trigger_config: src.trigger_config,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao duplicar fluxo");

    const { data: nodes } = await context.supabase
      .from("flow_nodes")
      .select("id, node_type, position, data")
      .eq("flow_id", data.flowId);
    const { data: edges } = await context.supabase
      .from("flow_edges")
      .select("source_node_id, target_node_id, source_handle, label, transition_delay_ms")
      .eq("flow_id", data.flowId);

    const idMap = new Map<string, string>();
    for (const n of nodes ?? []) idMap.set(n.id, crypto.randomUUID());

    if (nodes && nodes.length > 0) {
      await context.supabase.from("flow_nodes").insert(
        nodes.map((n) => ({
          id: idMap.get(n.id)!,
          flow_id: created.id,
          company_id: src.company_id,
          node_type: n.node_type,
          position: n.position,
          data: n.data,
        })),
      );
    }
    if (edges && edges.length > 0) {
      await context.supabase.from("flow_edges").insert(
        edges.map((e) => ({
          id: crypto.randomUUID(),
          flow_id: created.id,
          company_id: src.company_id,
          source_node_id: idMap.get(e.source_node_id) ?? e.source_node_id,
          target_node_id: idMap.get(e.target_node_id) ?? e.target_node_id,
          source_handle: e.source_handle,
          label: e.label,
          transition_delay_ms: Math.max(0, Math.floor((e as { transition_delay_ms?: number | null }).transition_delay_ms ?? 0)),
        })) as never,
      );
    }

    return { id: created.id };
  });

// ---- Update flow metadata (name/description/trigger) ----
export const updateFlowMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      flowId: string;
      name?: string;
      description?: string | null;
      triggerType?: string;
      triggerConfig?: Record<string, unknown>;
    }) =>
      z
        .object({
          flowId: z.string().uuid(),
          name: z.string().min(1).max(120).optional(),
          description: z.string().max(500).nullable().optional(),
          triggerType: z
            .enum(["manual", "inbound_message", "keyword", "transfer", "new_contact"])
            .optional(),
          triggerConfig: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      updated_at: string;
      name?: string;
      description?: string | null;
      trigger_type?: "manual" | "inbound_message" | "keyword" | "transfer" | "new_contact";
      trigger_config?: Json;
    } = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.triggerType !== undefined) patch.trigger_type = data.triggerType;
    if (data.triggerConfig !== undefined) patch.trigger_config = data.triggerConfig as Json;
    const { error } = await context.supabase
      .from("flows")
      .update(patch as never)
      .eq("id", data.flowId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Test-run a flow (step-by-step traversal, records a flow_run) ----
type FlowStep = {
  nodeId: string;
  nodeType: string;
  label: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: "ok" | "skipped" | "failed";
  durationMs: number;
  message?: string;
};

function resolveVars(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const parts = path.split(".");
    let cur: unknown = vars;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return `{{${path}}}`;
      }
    }
    return cur == null ? "" : String(cur);
  });
}

export const runFlowTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string; testMessage?: string; contactName?: string }) =>
    z
      .object({
        flowId: z.string().uuid(),
        testMessage: z.string().max(500).optional(),
        contactName: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: flow } = await context.supabase
      .from("flows")
      .select("id, company_id, runs_count")
      .eq("id", data.flowId)
      .maybeSingle();
    if (!flow) throw new Error("Fluxo não encontrado");

    const [{ data: nodes }, { data: edges }] = await Promise.all([
      context.supabase
        .from("flow_nodes")
        .select("id, node_type, data")
        .eq("flow_id", data.flowId),
      context.supabase
        .from("flow_edges")
        .select("source_node_id, target_node_id, source_handle")
        .eq("flow_id", data.flowId),
    ]);

    const nodeMap = new Map(
      (nodes ?? []).map((n) => [n.id, { ...n, data: (n.data ?? {}) as Record<string, unknown> }]),
    );
    const edgeMap = new Map<string, Array<{ target: string; handle: string | null }>>();
    for (const e of edges ?? []) {
      const arr = edgeMap.get(e.source_node_id) ?? [];
      arr.push({ target: e.target_node_id, handle: e.source_handle ?? null });
      edgeMap.set(e.source_node_id, arr);
    }

    const start = (nodes ?? []).find((n) => n.node_type === "start");
    if (!start) throw new Error("Fluxo sem nó de início.");

    const vars: Record<string, unknown> = {
      contact: { name: data.contactName ?? "Contato Teste", phone: "+55 11 99999-0000" },
      trigger: { message: data.testMessage ?? "olá" },
      last_message: data.testMessage ?? "olá",
    };

    const steps: FlowStep[] = [];
    const visited = new Set<string>();
    let cursor: string | undefined = start.id;
    let messagesSent = 0;
    let finalStatus: "completed" | "failed" | "waiting" = "completed";
    let errorMsg: string | null = null;
    const MAX_STEPS = 40;

    while (cursor && steps.length < MAX_STEPS) {
      if (visited.has(cursor)) {
        errorMsg = "Loop detectado no fluxo (nó já visitado).";
        finalStatus = "failed";
        break;
      }
      visited.add(cursor);
      const node = nodeMap.get(cursor);
      if (!node) break;
      const t0 = Date.now();
      const step: FlowStep = {
        nodeId: node.id,
        nodeType: node.node_type,
        label: String((node.data.label as string) ?? node.node_type),
        input: { ...vars },
        output: {},
        status: "ok",
        durationMs: 0,
      };
      let nextHandle: string | null = null;

      try {
        switch (node.node_type) {
          case "start":
            step.output = { started: true };
            break;
          case "message":
          case "send_message": {
            const body = String(node.data.body ?? node.data.text ?? "");
            if (!body) {
              step.status = "skipped";
              step.message = "Mensagem sem conteúdo";
            } else {
              const rendered = resolveVars(body, vars);
              step.output = { sent: rendered };
              messagesSent += 1;
            }
            break;
          }
          case "wait": {
            const s = Number(node.data.seconds ?? 0);
            step.output = { waited_seconds: s };
            step.message = `Simulado: aguardaria ${s}s`;
            break;
          }
          case "wait_reply": {
            step.output = { paused: true };
            step.message = "Aguardaria resposta do contato (pausado)";
            finalStatus = "waiting";
            cursor = undefined;
            break;
          }
          case "condition": {
            const expr = String(node.data.expression ?? "");
            const result = /vip|true|1/i.test(expr);
            nextHandle = result ? "true" : "false";
            step.output = { expression: expr, result };
            break;
          }
          case "ai": {
            const agentId = String(node.data.agent_id ?? "");
            if (!agentId) {
              step.status = "skipped";
              step.message = "Nenhum agente configurado";
            } else {
              const { data: agent } = await context.supabase
                .from("ai_agents")
                .select("name")
                .eq("id", agentId)
                .maybeSingle();
              step.output = {
                agent: agent?.name ?? "?",
                simulated_reply: `[IA] resposta para "${vars.last_message}"`,
              };
              vars["ai"] = { output: step.output.simulated_reply };
            }
            break;
          }
          case "assign_agent": {
            step.output = { assigned_to: node.data.user_id ?? null };
            step.message = "Simulado: atribuiria conversa";
            break;
          }
          case "transfer": {
            step.output = { transferred: true };
            step.message = "Simulado: transferiria para humano";
            break;
          }
          case "tag":
          case "add_tag": {
            step.output = { tag: node.data.tag };
            break;
          }
          case "http_request": {
            step.output = { url: node.data.url, method: node.data.method ?? "GET" };
            step.message = "Simulado: chamada HTTP não executada em teste";
            break;
          }
          case "webhook": {
            step.output = { url: node.data.url };
            step.message = "Simulado: webhook não disparado em teste";
            break;
          }
          case "question": {
            const body = String(node.data.body ?? "");
            step.output = { asked: resolveVars(body, vars) };
            break;
          }
          case "send_image":
          case "send_audio":
          case "send_video":
          case "send_document": {
            const url = String(node.data.media_url ?? "");
            if (!url) {
              step.status = "skipped";
              step.message = "Mídia não configurada";
            } else {
              const caption = node.data.caption ? resolveVars(String(node.data.caption), vars) : "";
              const mediaKind = node.node_type.replace("send_", "");
              step.output = {
                kind: mediaKind,
                url,
                filename: node.data.media_filename ?? null,
                mime_type: node.data.media_mime ?? null,
                size: node.data.media_size ?? null,
                caption: caption || null,
                is_voice: mediaKind === "audio" ? !!node.data.is_voice : undefined,
              };
              messagesSent += 1;
            }
            break;
          }
          case "end": {
            step.output = { ended: true };
            cursor = undefined;
            break;
          }
          default:
            step.message = `Tipo "${node.node_type}" não reconhecido (ignorado)`;
            step.status = "skipped";
        }
      } catch (err) {
        step.status = "failed";
        step.message = err instanceof Error ? err.message : String(err);
        finalStatus = "failed";
        errorMsg = step.message;
      }

      step.durationMs = Date.now() - t0;
      steps.push(step);

      if (finalStatus === "failed" || finalStatus === "waiting" || cursor === undefined) break;

      const outgoing = edgeMap.get(node.id) ?? [];
      const chosen =
        nextHandle != null
          ? outgoing.find((e) => e.handle === nextHandle) ?? outgoing[0]
          : outgoing[0];
      cursor = chosen?.target;
    }

    const now = new Date().toISOString();
    const { data: run, error } = await context.supabase
      .from("flow_runs")
      .insert({
        company_id: flow.company_id,
        flow_id: flow.id,
        status: finalStatus,
        messages_sent: messagesSent,
        started_at: now,
        completed_at: finalStatus === "waiting" ? null : now,
        error: errorMsg,
        conversation_id: null,
        steps: steps as unknown as Json,
        variables: vars as unknown as Json,
        cursor_node_id: cursor ?? null,
        is_test: true,
      } as never)
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await context.supabase
      .from("flows")
      .update({ runs_count: (flow.runs_count ?? 0) + 1 })
      .eq("id", flow.id);

    return {
      runId: (run?.id ?? null) as string | null,
      messagesSent,
      stepsJson: JSON.stringify(steps),
      status: finalStatus,
      error: errorMsg,
    };
  });

// ---- Get a single run with full step timeline ----
export const getFlowRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) =>
    z.object({ runId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("flow_runs")
      .select("id, status, messages_sent, error, started_at, completed_at, steps, variables, is_test")
      .eq("id", data.runId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Execução não encontrada");
    return {
      id: run.id,
      status: run.status,
      messages_sent: run.messages_sent,
      error: run.error,
      started_at: run.started_at,
      completed_at: run.completed_at,
      is_test: run.is_test,
      stepsJson: JSON.stringify(run.steps ?? []),
      variablesJson: JSON.stringify(run.variables ?? {}),
    };
  });

// ---- Flow templates (built-in gallery) ----
type TemplateNodeSeed = {
  key: string;
  node_type: string;
  x: number;
  y: number;
  data: Record<string, unknown>;
};
type TemplateEdgeSeed = { from: string; to: string; handle?: string | null };
type FlowTemplate = {
  slug: string;
  name: string;
  description: string;
  triggerType: "manual" | "inbound_message" | "keyword" | "transfer" | "new_contact";
  triggerConfig: Record<string, unknown>;
  nodes: TemplateNodeSeed[];
  edges: TemplateEdgeSeed[];
};

const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    slug: "blank",
    name: "Em branco",
    description: "Comece do zero com apenas o nó de início.",
    triggerType: "manual",
    triggerConfig: {},
    nodes: [{ key: "s", node_type: "start", x: 0, y: 0, data: { label: "Início" } }],
    edges: [],
  },
  {
    slug: "welcome",
    name: "Boas-vindas",
    description: "Cumprimenta novos contatos e apresenta a empresa.",
    triggerType: "new_contact",
    triggerConfig: {},
    nodes: [
      { key: "s", node_type: "start", x: 0, y: 0, data: { label: "Início" } },
      {
        key: "m1",
        node_type: "message",
        x: 240,
        y: 0,
        data: { body: "Olá {{contact.name}}! 👋 Bem-vindo(a). Como posso ajudar hoje?" },
      },
      { key: "e", node_type: "end", x: 480, y: 0, data: { label: "Fim" } },
    ],
    edges: [
      { from: "s", to: "m1" },
      { from: "m1", to: "e" },
    ],
  },
  {
    slug: "qualification",
    name: "Qualificação de lead",
    description: "Pergunta o interesse, aguarda resposta e transfere para humano.",
    triggerType: "keyword",
    triggerConfig: { keyword: "quero" },
    nodes: [
      { key: "s", node_type: "start", x: 0, y: 0, data: { label: "Início" } },
      {
        key: "q",
        node_type: "message",
        x: 240,
        y: 0,
        data: { body: "Ótimo, {{contact.name}}! Qual solução mais te interessa?" },
      },
      { key: "w", node_type: "wait_reply", x: 480, y: 0, data: { label: "Aguardar resposta" } },
      { key: "t", node_type: "transfer", x: 720, y: 0, data: { label: "Transferir para vendas" } },
      { key: "e", node_type: "end", x: 960, y: 0, data: { label: "Fim" } },
    ],
    edges: [
      { from: "s", to: "q" },
      { from: "q", to: "w" },
      { from: "w", to: "t" },
      { from: "t", to: "e" },
    ],
  },
  {
    slug: "faq-ai",
    name: "FAQ com IA",
    description: "Responde perguntas frequentes usando um agente de IA.",
    triggerType: "inbound_message",
    triggerConfig: {},
    nodes: [
      { key: "s", node_type: "start", x: 0, y: 0, data: { label: "Início" } },
      { key: "ai", node_type: "ai", x: 240, y: 0, data: { label: "Responder com IA" } },
      {
        key: "m",
        node_type: "message",
        x: 480,
        y: 0,
        data: { body: "{{ai.output}}" },
      },
      { key: "e", node_type: "end", x: 720, y: 0, data: { label: "Fim" } },
    ],
    edges: [
      { from: "s", to: "ai" },
      { from: "ai", to: "m" },
      { from: "m", to: "e" },
    ],
  },
  {
    slug: "welcome-media",
    name: "Boas-vindas com mídia",
    description: "Cumprimenta com áudio + imagem e finaliza com texto. Configure a mídia depois.",
    triggerType: "new_contact",
    triggerConfig: {},
    nodes: [
      { key: "s", node_type: "start", x: 0, y: 0, data: { label: "Início" } },
      {
        key: "img",
        node_type: "send_image",
        x: 240,
        y: 0,
        data: { label: "Enviar imagem de capa", caption: "Olá {{contact.name}}! 👋" },
      },
      {
        key: "aud",
        node_type: "send_audio",
        x: 480,
        y: 0,
        data: { label: "Enviar áudio de boas-vindas", is_voice: true },
      },
      {
        key: "m",
        node_type: "message",
        x: 720,
        y: 0,
        data: { body: "Estamos aqui para te ajudar. Como podemos começar?" },
      },
      { key: "e", node_type: "end", x: 960, y: 0, data: { label: "Fim" } },
    ],
    edges: [
      { from: "s", to: "img" },
      { from: "img", to: "aud" },
      { from: "aud", to: "m" },
      { from: "m", to: "e" },
    ],
  },
];

export const listFlowTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () =>
    FLOW_TEMPLATES.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      triggerType: t.triggerType,
      nodeCount: t.nodes.length,
    })),
  );

export const createFlowFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string; name: string; description?: string }) =>
    z
      .object({
        slug: z.string().min(1),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tpl = FLOW_TEMPLATES.find((t) => t.slug === data.slug);
    if (!tpl) throw new Error("Template não encontrado");
    const companyId = await getCompanyId(context.supabase as never, context.userId);
    const { data: flow, error } = await context.supabase
      .from("flows")
      .insert({
        company_id: companyId,
        name: data.name,
        description: data.description ?? tpl.description,
        status: "draft",
        trigger_type: tpl.triggerType as never,
        trigger_config: tpl.triggerConfig as Json,
      })
      .select("id")
      .single();
    if (error || !flow) throw new Error(error?.message ?? "Falha ao criar fluxo");

    const idMap = new Map<string, string>();
    for (const n of tpl.nodes) idMap.set(n.key, crypto.randomUUID());

    if (tpl.nodes.length > 0) {
      const insN = await context.supabase.from("flow_nodes").insert(
        tpl.nodes.map((n) => ({
          id: idMap.get(n.key)!,
          flow_id: flow.id,
          company_id: companyId,
          node_type: n.node_type,
          position: { x: n.x, y: n.y } as Json,
          data: n.data as Json,
        })),
      );
      if (insN.error) throw new Error(insN.error.message);
    }
    if (tpl.edges.length > 0) {
      const insE = await context.supabase.from("flow_edges").insert(
        tpl.edges.map((e) => ({
          id: crypto.randomUUID(),
          flow_id: flow.id,
          company_id: companyId,
          source_node_id: idMap.get(e.from)!,
          target_node_id: idMap.get(e.to)!,
          source_handle: e.handle ?? null,
        })),
      );
      if (insE.error) throw new Error(insE.error.message);
    }

    // Auto-publica a versão inicial do template para uso imediato
    const snapshot = await buildSnapshot(context.supabase, flow.id);
    const hash = await sha256Hex(stableStringify(snapshot));
    await context.supabase.from("flow_versions").insert({
      flow_id: flow.id,
      company_id: companyId,
      version_number: 1,
      description: "Versão inicial criada via template",
      snapshot: snapshot as unknown as Json,
      integrity_hash: hash,
      status: "published",
      published_at: new Date().toISOString(),
    });

    return { id: flow.id };
  });

// ============================================================
// VERSIONAMENTO — snapshots completos com hash de integridade
// ============================================================

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

type FlowSnapshot = {
  flow: {
    name: string;
    description: string | null;
    trigger_type: string;
    trigger_config: unknown;
  };
  nodes: Array<{ id: string; node_type: string; position: unknown; data: unknown }>;
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    source_handle: string | null;
    label: string | null;
    transition_delay_ms?: number | null;
  }>;
};

type SupabaseLike = {
  from: (t: string) => {
    select: (s: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      } & PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
    };
  };
};

async function buildSnapshot(supabase: unknown, flowId: string): Promise<FlowSnapshot> {
  const sb = supabase as SupabaseLike;
  const flowRes = await sb
    .from("flows")
    .select("name, description, trigger_type, trigger_config")
    .eq("id", flowId)
    .maybeSingle();
  const flow = flowRes.data;
  if (!flow) throw new Error("Fluxo não encontrado");
  const nodesRes = await sb.from("flow_nodes").select("id, node_type, position, data").eq("flow_id", flowId);
  const edgesRes = await sb
    .from("flow_edges")
    .select("id, source_node_id, target_node_id, source_handle, label, transition_delay_ms")
    .eq("flow_id", flowId);

  return {
    flow: {
      name: String(flow.name ?? ""),
      description: (flow.description as string | null) ?? null,
      trigger_type: String(flow.trigger_type ?? "manual"),
      trigger_config: flow.trigger_config ?? {},
    },
    nodes: (nodesRes.data ?? []) as FlowSnapshot["nodes"],
    edges: (edgesRes.data ?? []) as FlowSnapshot["edges"],
  };
}

// ---- Create version (snapshot atual) ----
export const createFlowVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string; description?: string; publish?: boolean }) =>
    z
      .object({
        flowId: z.string().uuid(),
        description: z.string().max(500).optional(),
        publish: z.boolean().optional().default(false),
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

    const snapshot = await buildSnapshot(context.supabase, data.flowId);

    // CRITICAL-01 P2: bloquear publicação de grafo com nós-folha órfãos
    // (não-`end` sem próxima aresta). Publicar tais grafos leva o runtime a
    // completar silenciosamente no meio da execução.
    if (data.publish) {
      const check = validateGraphForPublish(
        snapshot.nodes as never,
        snapshot.edges as never,
      );
      if (!check.ok) throw new Error(check.error);
    }

    const hash = await sha256Hex(stableStringify(snapshot));

    const { data: nextNumber, error: rpcErr } = await context.supabase.rpc(
      "next_flow_version_number",
      { _flow_id: data.flowId },
    );
    if (rpcErr) throw new Error(rpcErr.message);

    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("flow_versions")
      .insert({
        flow_id: data.flowId,
        company_id: flow.company_id,
        version_number: (nextNumber as number) ?? 1,
        description: data.description ?? null,
        snapshot: snapshot as unknown as Json,
        integrity_hash: hash,
        status: data.publish ? "published" : "draft",
        created_by: context.userId,
        published_by: data.publish ? context.userId : null,
        published_at: data.publish ? now : null,
      } as never)
      .select("id, version_number, status, integrity_hash, created_at")
      .single();
    if (error) throw new Error(error.message);

    // CRITICAL-01 P1: ao publicar, promover o fluxo para 'active' automaticamente.
    // Elimina o descompasso entre "tem versão publicada" e "aparece como Ativo".
    if (data.publish) {
      const { error: activateErr } = await context.supabase
        .from("flows")
        .update({ status: "active" })
        .eq("id", data.flowId)
        .neq("status", "archived");
      if (activateErr) throw new Error(activateErr.message);
    }

    return row;
  });

// ---- List versions of a flow ----
export const listFlowVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string; limit?: number }) =>
    z
      .object({ flowId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("flow_versions")
      .select(
        "id, version_number, description, status, integrity_hash, created_at, published_at, restored_at, created_by, published_by, restored_by",
      )
      .eq("flow_id", data.flowId)
      .order("version_number", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---- Get one version with its full snapshot ----
export const getFlowVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string }) =>
    z.object({ versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("flow_versions")
      .select("*")
      .eq("id", data.versionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Versão não encontrada");
    return row;
  });

// ---- Restore a version into the live flow ----
export const restoreFlowVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string }) =>
    z.object({ versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: version } = await context.supabase
      .from("flow_versions")
      .select("id, flow_id, company_id, snapshot, integrity_hash")
      .eq("id", data.versionId)
      .maybeSingle();
    if (!version) throw new Error("Versão não encontrada");

    // Verifica integridade antes de aplicar
    const recomputed = await sha256Hex(stableStringify(version.snapshot));
    if (recomputed !== version.integrity_hash) {
      throw new Error("Falha na verificação de integridade da versão (hash inválido).");
    }

    const snap = version.snapshot as unknown as FlowSnapshot;

    // Snapshot antes de restaurar (para auditoria)
    const preSnap = await buildSnapshot(context.supabase, version.flow_id);
    const preHash = await sha256Hex(stableStringify(preSnap));
    const { data: preNumber } = await context.supabase.rpc("next_flow_version_number", {
      _flow_id: version.flow_id,
    });
    const now = new Date().toISOString();
    await context.supabase.from("flow_versions").insert({
      flow_id: version.flow_id,
      company_id: version.company_id,
      version_number: (preNumber as number) ?? 1,
      description: `Auto-snapshot antes de restaurar v${data.versionId.slice(0, 8)}`,
      snapshot: preSnap as unknown as Json,
      integrity_hash: preHash,
      status: "draft",
      created_by: context.userId,
    } as never);

    // Aplica snapshot: full replace
    const delE = await context.supabase.from("flow_edges").delete().eq("flow_id", version.flow_id);
    if (delE.error) throw new Error(delE.error.message);
    const delN = await context.supabase.from("flow_nodes").delete().eq("flow_id", version.flow_id);
    if (delN.error) throw new Error(delN.error.message);

    if (snap.nodes.length > 0) {
      const insN = await context.supabase.from("flow_nodes").insert(
        snap.nodes.map((n) => ({
          id: n.id,
          flow_id: version.flow_id,
          company_id: version.company_id,
          node_type: n.node_type,
          position: n.position as Json,
          data: n.data as Json,
        })),
      );
      if (insN.error) throw new Error(insN.error.message);
    }
    if (snap.edges.length > 0) {
      const insE = await context.supabase.from("flow_edges").insert(
        snap.edges.map((e) => ({
          id: e.id,
          flow_id: version.flow_id,
          company_id: version.company_id,
          source_node_id: e.source_node_id,
          target_node_id: e.target_node_id,
          source_handle: e.source_handle,
          label: e.label,
          transition_delay_ms: Math.max(0, Math.floor(e.transition_delay_ms ?? 0)),
        })) as never,
      );
      if (insE.error) throw new Error(insE.error.message);
    }

    await context.supabase
      .from("flows")
      .update({
        name: snap.flow.name,
        description: snap.flow.description,
        trigger_type: snap.flow.trigger_type as never,
        trigger_config: snap.flow.trigger_config as Json,
        updated_at: now,
      })
      .eq("id", version.flow_id);

    await context.supabase
      .from("flow_versions")
      .update({ restored_at: now, restored_by: context.userId })
      .eq("id", data.versionId);

    return { ok: true, flowId: version.flow_id };
  });

// ---- Duplicate a version (creates a new draft version with same snapshot) ----
export const duplicateFlowVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string; description?: string }) =>
    z
      .object({
        versionId: z.string().uuid(),
        description: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: src } = await context.supabase
      .from("flow_versions")
      .select("flow_id, company_id, snapshot, integrity_hash, version_number")
      .eq("id", data.versionId)
      .maybeSingle();
    if (!src) throw new Error("Versão não encontrada");

    const { data: nextNumber } = await context.supabase.rpc("next_flow_version_number", {
      _flow_id: src.flow_id,
    });

    const { data: row, error } = await context.supabase
      .from("flow_versions")
      .insert({
        flow_id: src.flow_id,
        company_id: src.company_id,
        version_number: (nextNumber as number) ?? 1,
        description: data.description ?? `Duplicada de v${src.version_number}`,
        snapshot: src.snapshot,
        integrity_hash: src.integrity_hash,
        status: "draft",
        created_by: context.userId,
      } as never)
      .select("id, version_number")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---- Compare two versions (returns diff summary) ----
export const compareFlowVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionAId: string; versionBId: string }) =>
    z
      .object({
        versionAId: z.string().uuid(),
        versionBId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: va }, { data: vb }] = await Promise.all([
      context.supabase
        .from("flow_versions")
        .select("id, version_number, snapshot, integrity_hash, created_at")
        .eq("id", data.versionAId)
        .maybeSingle(),
      context.supabase
        .from("flow_versions")
        .select("id, version_number, snapshot, integrity_hash, created_at")
        .eq("id", data.versionBId)
        .maybeSingle(),
    ]);
    if (!va || !vb) throw new Error("Versão não encontrada");

    const a = va.snapshot as unknown as FlowSnapshot;
    const b = vb.snapshot as unknown as FlowSnapshot;

    const aNodes = new Map(a.nodes.map((n) => [n.id, n]));
    const bNodes = new Map(b.nodes.map((n) => [n.id, n]));
    const aEdges = new Set(
      a.edges.map((e) => `${e.source_node_id}::${e.target_node_id}::${e.source_handle ?? ""}`),
    );
    const bEdges = new Set(
      b.edges.map((e) => `${e.source_node_id}::${e.target_node_id}::${e.source_handle ?? ""}`),
    );

    const nodesAdded = [...bNodes.keys()].filter((k) => !aNodes.has(k));
    const nodesRemoved = [...aNodes.keys()].filter((k) => !bNodes.has(k));
    const nodesChanged = [...bNodes.keys()].filter((k) => {
      const av = aNodes.get(k);
      const bv = bNodes.get(k);
      if (!av || !bv) return false;
      return stableStringify(av.data) !== stableStringify(bv.data) || av.node_type !== bv.node_type;
    });
    const edgesAdded = [...bEdges].filter((e) => !aEdges.has(e));
    const edgesRemoved = [...aEdges].filter((e) => !bEdges.has(e));

    const flowMetaChanged = stableStringify(a.flow) !== stableStringify(b.flow);

    return {
      versionA: { id: va.id, number: va.version_number, at: va.created_at },
      versionB: { id: vb.id, number: vb.version_number, at: vb.created_at },
      integrityValid: {
        a: va.integrity_hash === (await sha256Hex(stableStringify(a))),
        b: vb.integrity_hash === (await sha256Hex(stableStringify(b))),
      },
      diff: {
        flowMetaChanged,
        nodesAdded: nodesAdded.length,
        nodesRemoved: nodesRemoved.length,
        nodesChanged: nodesChanged.length,
        edgesAdded: edgesAdded.length,
        edgesRemoved: edgesRemoved.length,
      },
      details: {
        nodesAdded,
        nodesRemoved,
        nodesChanged,
      },
    };
  });

// ---- Archive a version (admin-only via RLS) ----
export const archiveFlowVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string }) =>
    z.object({ versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("flow_versions")
      .update({ status: "archived" })
      .eq("id", data.versionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



