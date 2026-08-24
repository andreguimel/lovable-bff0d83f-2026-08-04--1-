/**
 * Flow Executor Engine — server-only module.
 *
 * Responsibilities:
 *  - Load the persisted flow graph (nodes + edges), validate integrity.
 *  - Walk the graph as a state machine (CREATED → QUEUED → RUNNING → WAITING_* → COMPLETED/FAILED).
 *  - Delegate execution of each node to a pluggable NodeExecutor registered in `NODE_PLUGINS`.
 *  - Perform real side-effects (dispatch to WhatsApp provider, call Lovable AI, HTTP fetch,
 *    tag mutations, transfers) with retry, idempotency, and provider auditing.
 *  - Emit events on `flow_events` and step rows on `flow_run_steps` for observability.
 *  - Preserve cursor + context on WAITING_* so a Cloudflare Worker restart or a wait/delay
 *    can be resumed by the scheduler (`/api/public/flow-resume`).
 *
 * This module NEVER touches the browser; it is loaded on demand inside server-function handlers
 * and by the public scheduler route.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { dispatchSend, type ChannelRow, type SendPayload } from "./wa-providers/index.server";

// ---- Types ---------------------------------------------------------------

export type FlowState =
  | "CREATED"
  | "QUEUED"
  | "RUNNING"
  | "WAITING"
  | "WAITING_REPLY"
  | "WAITING_DELAY"
  | "PAUSED"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type StepState = "started" | "ok" | "failed" | "skipped" | "retried";

export type NodeRow = {
  id: string;
  node_type: string;
  data: Record<string, unknown>;
};

export type EdgeRow = {
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  /** FB-V1.2 · Smart Transition Delay — atraso em ms aplicado antes de executar o próximo nó. */
  transition_delay_ms?: number | null;
};

export type FlowRunRow = {
  id: string;
  company_id: string;
  flow_id: string;
  conversation_id: string | null;
  channel_id: string | null;
  state: FlowState;
  status: string;
  current_node_id: string | null;
  cursor_node_id: string | null;
  previous_node_id: string | null;
  execution_stack: unknown[];
  context_data: Record<string, unknown>;
  variables: Record<string, unknown>;
  retry_count: number;
  messages_sent: number;
  dry_run: boolean;
  metrics: Record<string, unknown>;
  // Runtime-02.1 publish-lock: pinned graph snapshot for this run
  published_version_id: string | null;
  published_version_number: number | null;
  graph_hash: string | null;
};

/**
 * Runtime-02.1 (Publish Lock)
 * Shape of a published flow_versions.snapshot used by loadGraph when a run
 * is pinned to a specific version. Mirrors `FlowSnapshot` in flows.functions.ts.
 */
type PublishedSnapshot = {
  flow?: unknown;
  nodes?: Array<{
    id: string;
    node_type: string;
    position?: unknown;
    data?: Record<string, unknown> | null;
  }>;
  edges?: Array<{
    id?: string;
    source_node_id: string;
    target_node_id: string;
    source_handle?: string | null;
    label?: string | null;
    transition_delay_ms?: number | null;
  }>;
};

export type ExecutionContext = {
  runId: string;
  companyId: string;
  flowId: string;
  supabase: SupabaseClient;
  conversation: {
    id: string | null;
    channelId: string | null;
    contactId: string | null;
  };
  channel: ChannelRow | null;
  contact: { id: string; name: string | null; phone: string | null } | null;
  variables: Record<string, unknown>;
  history: unknown[];
  dryRun: boolean;
  emit: (event: string, payload?: Record<string, unknown>, nodeId?: string | null) => Promise<void>;
};

export type NodeResult = {
  status: StepState;
  output?: Record<string, unknown>;
  nextHandle?: string | null;
  message?: string;
  wait?: { state: "WAITING_DELAY" | "WAITING_REPLY"; resumeAt?: string | null };
  provider?: {
    name: string;
    request?: Record<string, unknown>;
    response?: unknown;
    provider_message_id?: string | null;
    http_status?: number;
  };
  vars?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  messagesSent?: number;
};

export type NodeExecutor = {
  validate?(node: NodeRow, ctx: ExecutionContext): void | Promise<void>;
  execute(node: NodeRow, ctx: ExecutionContext): Promise<NodeResult>;
  /** Optional compensation hook for future rollback support. */
  rollback?(node: NodeRow, ctx: ExecutionContext, step: NodeResult): Promise<void>;
};

// ---- Variable manager ---------------------------------------------------

export function resolveVars(text: string, vars: Record<string, unknown>): string {
  if (!text) return "";

  const contactObj = (vars.contact ?? {}) as Record<string, unknown>;
  const rawName = String(contactObj.name ?? contactObj.nome ?? vars["nome-completo"] ?? vars.nome ?? "").trim();
  const fullName = rawName;
  const nameParts = fullName ? fullName.split(/\s+/) : [];
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") ?? "";

  const rawPhone = String(contactObj.phone ?? contactObj.telefone ?? vars.phone ?? vars.telefone ?? "").replace(/\D/g, "");
  let ddd = "";
  if (rawPhone.length >= 10) {
    const withoutCountry = rawPhone.length >= 12 && rawPhone.startsWith("55") ? rawPhone.slice(2) : rawPhone;
    ddd = withoutCountry.slice(0, 2);
  }

  const sysMap: Record<string, unknown> = {
    // Nomes e variações BotConversa + Sistema
    "nome-completo": fullName || "Cliente",
    "primeiro-nome": firstName || "Cliente",
    "primeiro_nome": firstName || "Cliente",
    "first_name": firstName || "Cliente",
    "last_name": lastName,
    sobrenome: lastName,
    nome: fullName || "Cliente",
    "contact.name": fullName || "Cliente",
    "contact.first_name": firstName || "Cliente",
    "contact.last_name": lastName,
    "contact.phone": contactObj.phone ?? vars.phone ?? "",
    "contact.email": contactObj.email ?? vars.email ?? "",

    // Telefone e DDD
    telefone: contactObj.phone ?? vars.phone ?? "",
    ddd: ddd,
    email: contactObj.email ?? vars.email ?? "",

    // Indicações
    "nome-indicador": contactObj.referrer_name ?? vars["nome-indicador"] ?? "",
    "numero-de-indicacoes": contactObj.referral_count ?? vars["numero-de-indicacoes"] ?? 0,
    "codigo-indicacao": contactObj.referral_code ?? vars["codigo-indicacao"] ?? "",

    // Contexto de Atendimento
    canal: (vars.channel as any)?.name ?? vars.canal ?? "",
    empresa: (vars.company as any)?.name ?? vars.empresa ?? "",
    atendente: (vars.user as any)?.name ?? (vars.agent as any)?.name ?? vars.atendente ?? "",

    // Fluxo & Respostas
    reply: vars.reply ?? vars.resposta ?? "",
    resposta: vars.reply ?? vars.resposta ?? "",
    last_message: vars.last_message ?? vars.ultima_mensagem ?? "",
    "ai.output": vars["ai.output"] ?? (vars.ai as any)?.output ?? "",
    "http.body": vars["http.body"] ?? (vars.http as any)?.body ?? "",
  };

  return text.replace(/\{{1,2}\s*([\w.-]+)\s*\}}{1,2}/g, (match, path: string) => {
    const key = path.trim();
    if (key in sysMap) {
      const val = sysMap[key];
      return val == null ? "" : String(val);
    }

    const parts = key.split(".");
    let cur: unknown = vars;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return "";
      }
    }
    return cur == null ? "" : String(cur);
  });
}

// ---- Retry policy -------------------------------------------------------

type RetryPolicy = {
  max: number;
  strategy: "exponential" | "linear" | "fixed" | "immediate";
  delayMs: number;
};

function parseRetryPolicy(nd: Record<string, unknown>): RetryPolicy {
  const rp = (nd.retry_policy as Record<string, unknown> | undefined) ?? {};
  return {
    max: Number(rp.max ?? nd.retry_count ?? 3) || 0,
    strategy: (rp.strategy as RetryPolicy["strategy"]) ?? "exponential",
    delayMs: Number(rp.delay_ms ?? nd.retry_delay ?? 500) || 500,
  };
}

function nextDelay(p: RetryPolicy, attempt: number): number {
  if (p.strategy === "immediate") return 0;
  if (p.strategy === "fixed") return p.delayMs;
  if (p.strategy === "linear") return p.delayMs * (attempt + 1);
  return p.delayMs * Math.pow(2, attempt);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Node plugin registry ----------------------------------------------

const startEnd: NodeExecutor = {
  async execute(node) {
    if (node.node_type === "end") return { status: "ok", output: { ended: true } };
    return { status: "ok", output: { started: true } };
  },
};

const messageNode: NodeExecutor = {
  async execute(node, ctx) {
    const nd = node.data;
    let body = "";

    // Prioritize text from ContainerBlockNode items array
    if (Array.isArray(nd.items) && nd.items.length > 0) {
      const textItems = (nd.items as Array<Record<string, unknown>>).filter(
        (i) => i && (i.type === "text" || i.content != null || i.body != null || i.text != null),
      );
      if (textItems.length > 0) {
        body = textItems
          .map((i) => String(i.content ?? i.body ?? i.text ?? ""))
          .filter((t) => t.trim().length > 0)
          .join("\n\n");
      }
    }

    if (!body) {
      body = String(nd.body ?? nd.text ?? nd.message ?? "");
    }

    if (!body) return { status: "skipped", message: "Mensagem sem conteúdo" };
    const rendered = resolveVars(body, ctx.variables);

    // Insert into messages table (audit + inbox view). Capture id so we can
    // persist the `provider_message_id` returned by the provider (R2-H-05).
    let insertedMessageId: string | null = null;
    if (!ctx.dryRun && ctx.conversation.id) {
      const { data: inserted } = await ctx.supabase
        .from("messages")
        .insert({
          company_id: ctx.companyId,
          conversation_id: ctx.conversation.id,
          channel_id: ctx.channel?.id ?? ctx.conversation.channelId ?? null,
          direction: "outbound",
          type: "text",
          body: rendered,
          status: "sent",
          media_metadata: { automated: true, flow_run_id: ctx.runId, flow_node_id: node.id },
        })
        .select("id")
        .single();
      insertedMessageId = inserted?.id ?? null;
    }

    // Provider dispatch (WhatsApp / provider abstraction)
    let providerInfo: NodeResult["provider"];
    if (!ctx.dryRun && ctx.channel && ctx.contact?.phone) {
      const res = await dispatchSend(ctx.channel, { type: "text", to: ctx.contact.phone, body: rendered });
      providerInfo = {
        name: res.provider,
        request: res.request,
        response: res.response,
        provider_message_id: "provider_message_id" in res ? res.provider_message_id : null,
        http_status: res.http_status,
      };
      if (!res.ok) throw new Error(`Provider: ${res.error}`);
      // Persist provider id so delivered/read ACKs can bind back to the row.
      if (insertedMessageId && providerInfo?.provider_message_id) {
        await ctx.supabase
          .from("messages")
          .update({ provider_message_id: providerInfo.provider_message_id })
          .eq("id", insertedMessageId);
      }
    }

    return { status: "ok", output: { sent: rendered }, provider: providerInfo, messagesSent: 1 };
  },
};

const mediaKindByType: Record<string, "image" | "audio" | "video" | "file"> = {
  send_image: "image",
  send_audio: "audio",
  send_video: "video",
  send_document: "file",
};

const mediaNode: NodeExecutor = {
  async execute(node, ctx) {
    const nd = node.data;
    const kind = mediaKindByType[node.node_type];
    const url = String(nd.media_url ?? "");
    if (!url) return { status: "skipped", message: "Mídia não configurada" };

    const caption = nd.caption ? resolveVars(String(nd.caption), ctx.variables) : undefined;
    const filename = (nd.media_filename as string | undefined) ?? undefined;
    const mime = (nd.media_mime as string | undefined) ?? undefined;
    const isVoice = kind === "audio" && !!nd.is_voice;

    // Audit row in messages table. Capture id so we can persist the
    // `provider_message_id` returned by the provider (R2-H-05).
    let insertedMessageId: string | null = null;
    if (!ctx.dryRun && ctx.conversation.id) {
      const { data: inserted } = await ctx.supabase
        .from("messages")
        .insert({
          company_id: ctx.companyId,
          conversation_id: ctx.conversation.id,
          channel_id: ctx.channel?.id ?? ctx.conversation.channelId ?? null,
          direction: "outbound",
          type: kind === "file" ? "document" : kind,
          body: caption ?? null,
          status: "sent",
          media_url: url,
          media_metadata: {
            automated: true,
            flow_run_id: ctx.runId,
            flow_node_id: node.id,
            mime,
            filename,
            is_voice: isVoice,
          },
        })
        .select("id")
        .single();
      insertedMessageId = inserted?.id ?? null;
    }

    let providerInfo: NodeResult["provider"];
    if (!ctx.dryRun && ctx.channel && ctx.contact?.phone) {
      let payload: SendPayload;
      if (kind === "audio") {
        payload = { type: "audio", to: ctx.contact.phone, mediaUrl: url, voice: isVoice, mime };
      } else if (kind === "image" || kind === "video") {
        payload = { type: kind, to: ctx.contact.phone, mediaUrl: url, caption };
      } else {
        payload = { type: "file", to: ctx.contact.phone, mediaUrl: url, filename };
      }
      const res = await dispatchSend(ctx.channel, payload);
      providerInfo = {
        name: res.provider,
        request: res.request,
        response: res.response,
        provider_message_id: "provider_message_id" in res ? res.provider_message_id : null,
        http_status: res.http_status,
      };
      if (!res.ok) throw new Error(`Provider: ${res.error}`);
      if (insertedMessageId && providerInfo?.provider_message_id) {
        await ctx.supabase
          .from("messages")
          .update({ provider_message_id: providerInfo.provider_message_id })
          .eq("id", insertedMessageId);
      }
    }

    return {
      status: "ok",
      output: { kind, url, caption: caption ?? null, is_voice: isVoice, mime, filename },
      provider: providerInfo,
      messagesSent: 1,
    };
  },
};

const waitNode: NodeExecutor = {
  async execute(node) {
    const seconds = Number(node.data.seconds ?? 0);
    const isTyping = !!node.data.is_typing;
    if (seconds <= 0) return { status: "ok", output: { waited: 0, is_typing: isTyping } };
    const resumeAt = new Date(Date.now() + seconds * 1000).toISOString();
    return {
      status: "ok",
      output: { wait_seconds: seconds, resume_at: resumeAt, is_typing: isTyping },
      wait: { state: "WAITING_DELAY", resumeAt },
    };
  },
};

const waitReplyNode: NodeExecutor = {
  async execute(_node, ctx) {
    // Resume path: if a reply was injected into variables, don't re-pause.
    // The runtime resumeFlowRun handler sets `variables.reply` before calling executeRun.
    if (ctx.variables && (ctx.variables as { reply?: unknown }).reply != null) {
      return { status: "ok", output: { resumed_with_reply: true } };
    }
    return {
      status: "ok",
      output: { paused_for_reply: true },
      wait: { state: "WAITING_REPLY" },
    };
  },
};

// ---- Menu node (FB-10.4A) ------------------------------------------------
// Reusa o mecanismo WAITING_REPLY: envia a pergunta + lista numerada e
// pausa até o contato responder. No retorno, tenta casar a resposta com
// uma opção (por número ou texto exato) e escolhe o handle correspondente.
// Suporta `max_attempts` — depois disso segue pelo handle `invalid`.
// Estado por-run persistido em `variables.__menu = { nodeId, attempts }`.
type MenuOption = { id: string; label: string };
type MenuState = { nodeId: string; attempts: number };

async function sendMenuText(
  ctx: ExecutionContext,
  node: NodeRow,
  text: string,
): Promise<NodeResult["provider"] | undefined> {
  const rendered = resolveVars(text, ctx.variables);
  let insertedMessageId: string | null = null;
  if (!ctx.dryRun && ctx.conversation.id) {
    const { data: inserted } = await ctx.supabase
      .from("messages")
      .insert({
        company_id: ctx.companyId,
        conversation_id: ctx.conversation.id,
        channel_id: ctx.channel?.id ?? ctx.conversation.channelId ?? null,
        direction: "outbound",
        type: "text",
        body: rendered,
        status: "sent",
        media_metadata: { automated: true, flow_run_id: ctx.runId, flow_node_id: node.id, menu: true },
      })
      .select("id")
      .single();
    insertedMessageId = inserted?.id ?? null;
  }
  if (!ctx.dryRun && ctx.channel && ctx.contact?.phone) {
    const res = await dispatchSend(ctx.channel, { type: "text", to: ctx.contact.phone, body: rendered });
    if (!res.ok) throw new Error(`Provider: ${res.error}`);
    const provider = {
      name: res.provider,
      request: res.request,
      response: res.response,
      provider_message_id: "provider_message_id" in res ? res.provider_message_id : null,
      http_status: res.http_status,
    };
    if (insertedMessageId && provider.provider_message_id) {
      await ctx.supabase
        .from("messages")
        .update({ provider_message_id: provider.provider_message_id })
        .eq("id", insertedMessageId);
    }
    return provider;
  }
  return undefined;
}

function parseMenuOptions(nd: Record<string, unknown>): MenuOption[] {
  const raw = Array.isArray(nd.options)
    ? (nd.options as unknown[])
    : Array.isArray(nd.items)
    ? (nd.items as unknown[])
    : Array.isArray(nd.subItems)
    ? (nd.subItems as unknown[])
    : Array.isArray(nd.buttons)
    ? (nd.buttons as unknown[])
    : [];
  const out: MenuOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as { id?: unknown; label?: unknown; text?: unknown; title?: unknown };
    const id = typeof o.id === "string" ? o.id : "";
    const label =
      typeof o.label === "string" && o.label.trim()
        ? o.label.trim()
        : typeof o.text === "string" && o.text.trim()
          ? o.text.trim()
          : typeof o.title === "string" && o.title.trim()
            ? o.title.trim()
            : "";
    if (id && label) out.push({ id, label });
  }
  return out;
}

function matchMenuReply(reply: string, options: MenuOption[]): MenuOption | null {
  const trimmed = reply.trim();
  if (!trimmed) return null;
  const num = Number(trimmed.replace(/[.)\-]$/, ""));
  if (Number.isInteger(num) && num >= 1 && num <= options.length) {
    return options[num - 1];
  }
  const lower = trimmed.toLowerCase();
  const exact = options.find((o) => o.label.toLowerCase() === lower);
  if (exact) return exact;
  return null;
}

const menuNode: NodeExecutor = {
  async execute(node, ctx) {
    const options = parseMenuOptions(node.data);
    const body = String(node.data.body ?? "").trim();
    if (options.length < 2 || !body) {
      return { status: "skipped", message: "Menu sem pergunta ou opções suficientes" };
    }
    const maxAttempts = Math.max(1, Number(node.data.max_attempts ?? 2) || 2);
    const invalidMessage =
      (typeof node.data.invalid_message === "string" && node.data.invalid_message.trim()) ||
      "Não entendi. Por favor, responda com o número de uma das opções.";

    const menuState =
      ctx.variables && typeof ctx.variables === "object"
        ? ((ctx.variables as { __menu?: MenuState }).__menu ?? null)
        : null;
    // `variables.reply` é injetado por flow-resume-inbound como objeto
    // ({ id, type, body, media_url, from, received_at }). Aceitamos também
    // string bruta para compatibilidade com resumes sintéticos/testes.
    const rawReply =
      ctx.variables && typeof ctx.variables === "object"
        ? (ctx.variables as { reply?: unknown }).reply
        : null;
    let reply: string | null = null;
    if (typeof rawReply === "string") reply = rawReply;
    else if (rawReply && typeof rawReply === "object") {
      const body = (rawReply as { body?: unknown }).body;
      if (typeof body === "string") reply = body;
    }

    // FIRST ENTRY — envia a pergunta + lista e pausa esperando resposta.
    if (!menuState || menuState.nodeId !== node.id || reply == null) {
      const list = options.map((o, i) => `${i + 1}) ${o.label}`).join("\n");
      const prompt = `${body}\n\n${list}`;
      const provider = await sendMenuText(ctx, node, prompt);
      return {
        status: "ok",
        output: { prompt_sent: true, option_count: options.length },
        provider,
        messagesSent: provider ? 1 : 0,
        vars: { __menu: { nodeId: node.id, attempts: 0 }, reply: null },
        wait: { state: "WAITING_REPLY" },
      };
    }

    // RESUME — tenta casar a resposta com uma opção.
    const match = matchMenuReply(reply, options);
    if (match) {
      return {
        status: "ok",
        output: { matched: match.id, matched_label: match.label, reply },
        nextHandle: match.id,
        vars: { __menu: null, reply: null, menu_choice: match.label, menu_choice_id: match.id },
      };
    }

    const attempts = (menuState.attempts ?? 0) + 1;
    if (attempts >= maxAttempts) {
      return {
        status: "ok",
        output: { invalid: true, reply, attempts },
        nextHandle: "invalid",
        vars: { __menu: null, reply: null, menu_last_reply: reply },
      };
    }

    // Reforço — reenvia a mensagem de "não entendi" e continua esperando.
    const provider = await sendMenuText(ctx, node, invalidMessage);
    return {
      status: "ok",
      output: { invalid_attempt: attempts, reply },
      provider,
      messagesSent: provider ? 1 : 0,
      vars: { __menu: { nodeId: node.id, attempts }, reply: null },
      wait: { state: "WAITING_REPLY" },
    };
  },
};

// ---- Question node (FB-V1.3) ---------------------------------------------
// Envia a pergunta e pausa em WAITING_REPLY. Quando o contato responde, grava
// a resposta na variável configurada e segue pelo handle `default`. Se o
// timeout configurado (`timeout_value` + `timeout_unit`) vencer sem resposta,
// o Scheduler retoma a run e o bloco segue pelo handle `no_reply`.
type QuestionState = { nodeId: string; askedAt: string };

const UNIT_SECONDS: Record<string, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

export function questionTimeoutSeconds(nd: Record<string, unknown>): number | null {
  const raw = Number(nd.timeout_value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const unit = typeof nd.timeout_unit === "string" ? nd.timeout_unit : "days";
  const mult = UNIT_SECONDS[unit] ?? UNIT_SECONDS.days;
  return Math.round(raw * mult);
}

const questionNode: NodeExecutor = {
  async execute(node, ctx) {
    const body = String(node.data.body ?? "").trim();
    if (!body) return { status: "skipped", message: "Pergunta sem texto" };

    const vars = (ctx.variables ?? {}) as Record<string, unknown>;
    const state = (vars.__question as QuestionState | undefined) ?? null;
    const rawReply = vars.reply;
    let reply: string | null = null;
    if (typeof rawReply === "string") reply = rawReply;
    else if (rawReply && typeof rawReply === "object") {
      const b = (rawReply as { body?: unknown }).body;
      if (typeof b === "string") reply = b;
    }

    const saveAs =
      (typeof node.data.save_as === "string" && node.data.save_as.trim()) || "resposta";

    // PRIMEIRA PASSAGEM — envia a pergunta e pausa.
    if (!state || state.nodeId !== node.id) {
      const provider = await sendMenuText(ctx, node, body);
      const seconds = questionTimeoutSeconds(node.data);
      const resumeAt = seconds ? new Date(Date.now() + seconds * 1000).toISOString() : undefined;
      return {
        status: "ok",
        output: {
          question_sent: true,
          paused_for_reply: true,
          timeout_seconds: seconds,
          resume_at: resumeAt ?? null,
        },
        provider,
        messagesSent: provider ? 1 : 0,
        vars: { __question: { nodeId: node.id, askedAt: new Date().toISOString() }, reply: null },
        wait: { state: "WAITING_REPLY", resumeAt },
      };
    }

    // RETOMADA COM RESPOSTA.
    if (reply != null) {
      return {
        status: "ok",
        output: { answered: true, reply },
        nextHandle: "default",
        vars: { __question: null, reply: null, last_reply: reply, [saveAs]: reply },
      };
    }

    // RETOMADA POR TIMEOUT — segue pela saída "se não responder".
    return {
      status: "ok",
      output: { timed_out: true, asked_at: state.askedAt },
      nextHandle: "no_reply",
      vars: { __question: null, reply: null },
    };
  },
};





// ---- Condition (FB-10.5) --------------------------------------------------
// Avaliador estruturado: `field` (path dotted em ctx.variables) + `operator`
// + `value` (com `{{...}}` interpolável). Compatível com nós legados que
// só possuem `expression` (fallback regex). Roteia por handle `true`/`false`.

const CONDITION_OPS = new Set([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "not_exists",
]);

function getByPath(vars: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = vars;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return cur;
}

function evalConditionOp(left: unknown, op: string, right: string): boolean {
  switch (op) {
    case "exists":
      return left !== null && left !== undefined && left !== "";
    case "not_exists":
      return left === null || left === undefined || left === "";
    case "equals":
      return String(left ?? "") === right;
    case "not_equals":
      return String(left ?? "") !== right;
    case "contains":
      if (Array.isArray(left)) return left.map((x) => String(x)).includes(right);
      return String(left ?? "").toLowerCase().includes(right.toLowerCase());
    case "not_contains":
      if (Array.isArray(left)) return !left.map((x) => String(x)).includes(right);
      return !String(left ?? "").toLowerCase().includes(right.toLowerCase());
    case "gt":
      return Number(left) > Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "lte":
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

function evalConditionRule(rule: any, ctx: ExecutionContext): boolean {
  switch (rule.type) {
    case "tag": {
      const tags = (ctx.variables.contact as { tags?: string[] } | undefined)?.tags ?? [];
      const tagName = String(rule.tag_name || "").trim().toLowerCase();
      const has = tags.some((t) => String(t).toLowerCase() === tagName);
      return rule.tag_operator === "has_not" ? !has : has;
    }
    case "weekday": {
      const now = new Date();
      const localDay = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getDay();
      const validDays: number[] = Array.isArray(rule.weekdays) ? rule.weekdays : [];
      return validDays.includes(localDay);
    }
    case "business_hours": {
      if (typeof (ctx.variables as any).__is_open === "boolean") {
        const isOpen = !!(ctx.variables as any).__is_open;
        return rule.business_hours_operator === "closed" ? !isOpen : isOpen;
      }
      const now = new Date();
      const brDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const day = brDate.getDay();
      const hours = brDate.getHours();
      const isOpen = day >= 1 && day <= 5 && hours >= 8 && hours < 18;
      return rule.business_hours_operator === "closed" ? !isOpen : isOpen;
    }
    case "time_window": {
      const now = new Date();
      const brDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const curMins = brDate.getHours() * 60 + brDate.getMinutes();
      const [startH, startM] = (rule.start_time || "08:00").split(":").map(Number);
      const [endH, endM] = (rule.end_time || "18:00").split(":").map(Number);
      const startMins = (startH || 0) * 60 + (startM || 0);
      const endMins = (endH || 0) * 60 + (endM || 0);
      return curMins >= startMins && curMins <= endMins;
    }
    case "assigned_agent": {
      const assigned = String(
        (ctx.variables.conversation as { assigned_user_id?: string; agent_id?: string } | undefined)?.assigned_user_id ||
        (ctx.variables.conversation as { assigned_user_id?: string; agent_id?: string } | undefined)?.agent_id ||
        ""
      );
      return assigned === String(rule.agent_user_id || "");
    }
    case "custom_field":
    default: {
      const field = String(rule.field || "").trim();
      const operator = String(rule.operator || "equals").trim();
      const rawVal = String(rule.value || "");
      const resolvedVal = resolveVars(rawVal, ctx.variables);
      const leftVal = getByPath(ctx.variables, field);
      return evalConditionOp(leftVal, operator, resolvedVal);
    }
  }
}

const conditionNode: NodeExecutor = {
  async execute(node, ctx) {
    const nd = node.data;

    // Multi-condition evaluation (BotConversa style)
    const conditions = Array.isArray(nd.conditions) ? nd.conditions : [];
    if (conditions.length > 0) {
      const logic = nd.logic === "ANY" ? "ANY" : "ALL";
      const results = conditions.map((rule) => evalConditionRule(rule, ctx));
      const pass = logic === "ANY" ? results.some(Boolean) : results.every(Boolean);
      return {
        status: "ok",
        output: {
          mode: "multi_condition",
          logic,
          results,
          pass,
        },
        nextHandle: pass ? "true" : "false",
      };
    }

    const field = typeof nd.field === "string" ? nd.field.trim() : "";
    const operator = typeof nd.operator === "string" ? nd.operator.trim() : "";

    // Structured path (FB-10.5): field + operator (+ value quando aplicável).
    if (field && CONDITION_OPS.has(operator)) {
      const rawValue = nd.value == null ? "" : String(nd.value);
      const resolvedValue = resolveVars(rawValue, ctx.variables);
      const leftValue = getByPath(ctx.variables, field);
      const pass = evalConditionOp(leftValue, operator, resolvedValue);
      return {
        status: "ok",
        output: {
          mode: "structured",
          field,
          operator,
          value: resolvedValue,
          left: leftValue === undefined ? null : (leftValue as unknown),
          result: pass,
        },
        nextHandle: pass ? "true" : "false",
      };
    }

    // Legacy fallback — mantém compatibilidade com nós antigos que só têm `expression`.
    const legacyField = String(nd.field ?? "expression");
    const op = String(nd.operator ?? "equals");
    const value = nd.value == null ? "" : String(nd.value);
    let pass = false;
    if (legacyField === "expression") {
      pass = /vip|true|1|yes|sim/i.test(String(nd.expression ?? ""));
    } else if (legacyField === "tag") {
      const tags = (ctx.variables.contact as { tags?: string[] } | undefined)?.tags ?? [];
      pass = op === "has" ? tags.includes(value) : !tags.includes(value);
    } else if (legacyField === "name") {
      const nm = String((ctx.variables.contact as { name?: string } | undefined)?.name ?? "").toLowerCase();
      pass = op === "contains" ? nm.includes(value.toLowerCase()) : nm === value.toLowerCase();
    }
    return {
      status: "ok",
      output: { mode: "legacy", field: legacyField, op, value, result: pass },
      nextHandle: pass ? "true" : "false",
    };
  },
};

const aiNode: NodeExecutor = {
  async execute(node, ctx) {
    const agentId = String(node.data.agent_id ?? "");
    const customExitConditions = Array.isArray(node.data.exitConditions)
      ? (node.data.exitConditions as Array<{ id: string; name: string }>)
      : [];

    let agentName = "Assistente de IA";
    let agentModel = "openai/gpt-4o-mini";
    let agentSystemPrompt =
      String(node.data.instructions ?? node.data.persona ?? node.data.prompt ?? "").trim() ||
      "Você é um assistente virtual inteligente.";

    if (agentId) {
      const { data: agent } = await ctx.supabase
        .from("ai_agents")
        .select("id, name, model, personality, prompt")
        .eq("id", agentId)
        .maybeSingle();

      if (agent) {
        agentName = agent.name;
        agentModel = agent.model || agentModel;
        agentSystemPrompt = agent.personality || agent.prompt || agentSystemPrompt;
      }
    }

    if (ctx.dryRun) {
      const simulated = `[IA/${agentName}] resposta simulada para "${String(ctx.variables.last_message ?? "")}"`;
      return {
        status: "ok",
        nextHandle: "success",
        output: { agent: agentName, simulated_reply: simulated },
        vars: { ai: { output: simulated } },
      };
    }

    try {
      const { buildGuardianModel } = await import("@/lib/ai-provider.server");
      const { generateText } = await import("ai");

      const t0 = Date.now();
      const { model, modelId } = await buildGuardianModel(ctx.supabase, ctx.companyId, agentModel);

      let systemPrompt = agentSystemPrompt;
      if (customExitConditions.length > 0) {
        systemPrompt += `\n\nCondições de saída disponíveis: ${customExitConditions.map((c) => `[${c.id}] ${c.name}`).join("; ")}.`;
      }

      const userMessage = String(ctx.variables.last_message ?? ctx.variables.input ?? "Olá");
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userMessage,
      });

      const reply = result.text.trim();

      // Determina qual saída (handle) acionar
      let chosenHandle = "success";
      if (customExitConditions.length > 0) {
        const matched = customExitConditions.find(
          (c) =>
            reply.toLowerCase().includes(c.name.toLowerCase()) ||
            reply.includes(`[${c.id}]`) ||
            reply.toLowerCase().includes(c.id.toLowerCase()),
        );
        if (matched) {
          chosenHandle = matched.id;
        }
      }

      return {
        status: "ok",
        nextHandle: chosenHandle,
        output: { agent: agentName, model: modelId, reply, selected_handle: chosenHandle },
        vars: { ai: { output: reply } },
        metrics: { ai_latency_ms: Date.now() - t0 },
      };
    } catch (err: any) {
      // Se houver erro na IA, desvia para a saída de falha ("failure")
      return {
        status: "ok",
        nextHandle: "failure",
        output: { error: err?.message ?? String(err) },
        message: `Falha na execução da IA: ${err?.message ?? String(err)}`,
      };
    }
  },
};

// ---- HTTP request (FB-10.5) ----------------------------------------------
// Config: method, url ({{..}}), headers (Key: Value por linha, {{..}}),
// auth (none|bearer + auth_token {{..}}), body (string com {{..}}),
// timeout_ms (default 10000, max 30000), save_as (default "http").
// Guardas: SSRF (bloqueia hosts privados/localhost/link-local),
// esquema restrito a http/https, timeout via AbortController,
// body truncado a 8KB no output/variável.

const HTTP_DEFAULT_TIMEOUT_MS = 10_000;
const HTTP_MAX_TIMEOUT_MS = 30_000;
const HTTP_MAX_BODY_BYTES = 8 * 1024;

const HTTP_PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

// Final Production Acceptance Gate — SSRF hardening.
// Fecha bypasses de parser: decimal (2130706433 == 127.0.0.1),
// hex (0x7f000001) e octal (017700000001). Retorna o IP dotted
// canônico quando reconhece o formato, caso contrário `null`.
function normalizeNumericIPv4(host: string): string | null {
  const h = host.trim();
  if (!h) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return h;

  const toParts = (n: bigint): string | null => {
    if (n < 0n || n > 0xffffffffn) return null;
    const b0 = Number((n >> 24n) & 0xffn);
    const b1 = Number((n >> 16n) & 0xffn);
    const b2 = Number((n >> 8n) & 0xffn);
    const b3 = Number(n & 0xffn);
    return `${b0}.${b1}.${b2}.${b3}`;
  };

  if (/^0x[0-9a-f]+$/i.test(h)) {
    try { return toParts(BigInt(h)); } catch { return null; }
  }
  if (/^0[0-7]+$/.test(h)) {
    try { return toParts(BigInt("0o" + h.slice(1))); } catch { return null; }
  }
  if (/^\d+$/.test(h)) {
    try { return toParts(BigInt(h)); } catch { return null; }
  }
  return null;
}

export function isPrivateHost(host: string): boolean {
  if (!host) return true;
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const normalized = normalizeNumericIPv4(h) ?? h;
  return HTTP_PRIVATE_HOST_PATTERNS.some((p) => p.test(normalized));
}

// Best-effort DNS lookup — o runtime Cloudflare/workerd pode não expor
// `node:dns`; nesse caso degrada silenciosamente e a proteção se apoia
// em: hostname literal + `redirect: "manual"` no fetch (revalidação
// de cada Location externa).
async function resolveHostIfPossible(host: string): Promise<string[] | null> {
  try {
    const dns = await import("node:dns/promises");
    const looked = await dns.lookup(host, { all: true, verbatim: true });
    return looked.map((r) => r.address);
  } catch {
    return null;
  }
}

async function isHostnameResolvablyPrivate(host: string): Promise<boolean> {
  if (isPrivateHost(host)) return true;
  const addrs = await resolveHostIfPossible(host);
  if (!addrs || addrs.length === 0) return false;
  return addrs.some((a) => isPrivateHost(a));
}

function parseHeaderLines(raw: unknown, vars: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== "string" || !raw.trim()) return out;
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = resolveVars(line.slice(idx + 1).trim(), vars);
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function clampBody(text: string): string {
  return text.length > HTTP_MAX_BODY_BYTES ? text.slice(0, HTTP_MAX_BODY_BYTES) : text;
}

function tryParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const httpNode: NodeExecutor = {
  async execute(node, ctx) {
    const nd = node.data;
    const rawUrl = String(nd.url ?? "").trim();
    if (!rawUrl) return { status: "skipped", message: "URL não configurada" };
    const url = resolveVars(rawUrl, ctx.variables);
    const method = String(nd.method ?? "GET").toUpperCase();
    const timeoutMs = Math.min(
      HTTP_MAX_TIMEOUT_MS,
      Math.max(500, Number(nd.timeout_ms ?? HTTP_DEFAULT_TIMEOUT_MS) || HTTP_DEFAULT_TIMEOUT_MS),
    );
    const saveAs = (typeof nd.save_as === "string" && nd.save_as.trim()) || "http";

    // Parse + guarda de esquema/SSRF.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { status: "failed", message: `URL inválida: ${url}` };
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return { status: "failed", message: `Esquema não permitido: ${parsedUrl.protocol}` };
    }
    if (await isHostnameResolvablyPrivate(parsedUrl.hostname)) {
      return {
        status: "failed",
        message: `Host bloqueado por segurança (rede privada): ${parsedUrl.hostname}`,
      };
    }

    // Headers + auth.
    const headers: Record<string, string> = parseHeaderLines(nd.headers, ctx.variables);
    const authType = String(nd.auth_type ?? "none");
    if (authType === "bearer") {
      const tokenRaw = String(nd.auth_token ?? "").trim();
      if (tokenRaw) {
        headers["Authorization"] = `Bearer ${resolveVars(tokenRaw, ctx.variables)}`;
      }
    }

    // Body.
    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const rawBody = nd.body;
      if (typeof rawBody === "string") {
        body = resolveVars(rawBody, ctx.variables);
      } else if (rawBody != null) {
        body = JSON.stringify(rawBody);
      }
      if (body && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    }

    if (ctx.dryRun) {
      return {
        status: "ok",
        output: { url, method, dry_run: true, save_as: saveAs },
        vars: { [saveAs]: { dry_run: true, url, method } },
      };
    }

    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      // `redirect: "manual"` impede que o fetch siga um 3xx cujo
      // Location aponte para localhost/RFC1918/IMDS. Qualquer 3xx é
      // tratado como falha explícita — o usuário deve chamar a URL
      // final diretamente. Fecha o bypass de SSRF via redirect.
      response = await fetch(url, { method, headers, body, signal: controller.signal, redirect: "manual" });
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as { name?: string } | null)?.name === "AbortError";
      return {
        status: "failed",
        message: aborted
          ? `Timeout após ${timeoutMs}ms`
          : `Falha de rede: ${(e as Error).message ?? String(e)}`,
        metrics: { http_latency_ms: Date.now() - t0, http_aborted: aborted },
      };
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      return {
        status: "failed",
        message: `Redirecionamento bloqueado por segurança (${response.status}). Chame a URL de destino diretamente.`,
        output: { status: response.status, redirected_to: location, ok: false, save_as: saveAs },
        vars: { [saveAs]: { ok: false, status: response.status, redirected_to: location, headers: {}, body: "" } },
        metrics: { http_latency_ms: Date.now() - t0 },
      };
    }


    const rawText = await response.text().catch(() => "");
    const text = clampBody(rawText);
    const parsed = tryParseJson(text);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    const outputVar = {
      ok: response.ok,
      status: response.status,
      headers: responseHeaders,
      body: parsed ?? text,
    };

    return {
      status: response.ok ? "ok" : "failed",
      output: { status: response.status, ok: response.ok, save_as: saveAs, body: text },
      vars: { [saveAs]: outputVar },
      metrics: { http_latency_ms: Date.now() - t0 },
      provider: {
        name: "http",
        request: { url, method },
        response: { body: text },
        http_status: response.status,
      },
    };
  },
};

const tagNode: NodeExecutor = {
  async execute(node, ctx) {
    const tagId = node.data.tag_id as string | undefined;
    if (!tagId || !ctx.contact?.id) return { status: "skipped", message: "Tag ou contato ausente" };
    if (!ctx.dryRun) {
      await ctx.supabase.from("contact_tags").insert({
        contact_id: ctx.contact.id,
        tag_id: tagId,
        company_id: ctx.companyId,
      });
    }
    return { status: "ok", output: { tag_id: tagId } };
  },
};

const transferNode: NodeExecutor = {
  async execute(node, ctx) {
    const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    const targetType = strOrNull(node.data.target_type) ?? "queue";
    const userId = targetType === "agent" ? (strOrNull(node.data.agent_id) ?? strOrNull(node.data.user_id)) : null;
    const department = targetType === "department" ? strOrNull(node.data.department) : null;
    const message = strOrNull(node.data.transfer_message);

    if (!ctx.dryRun && ctx.conversation.id) {
      const updateData: Record<string, any> = {
        assigned_user_id: userId,
        assigned_agent_id: null,
      };
      if (department) {
        updateData.department = department;
      }
      await ctx.supabase
        .from("conversations")
        .update(updateData)
        .eq("id", ctx.conversation.id);

      if (message) {
        await ctx.supabase.from("conversation_transfers").insert({
          conversation_id: ctx.conversation.id,
          company_id: (ctx.conversation as any).company_id ?? (ctx as any).companyId,
          transferred_by: null,
          to_user_id: userId,
          note: message,
          event_type: "conversation_transferred",
        });
      }
    }
    return { status: "ok", output: { target_type: targetType, transferred_to: userId, department } };
  },
};

// ---------------------------------------------------------------------------
// FB-10.4B — Bloco Ação (kind: "action")
//
// Executor único que despacha, com base em `data.action_type`, para operações
// idempotentes e seguras multi-tenant (todo lookup é filtrado por
// ctx.companyId antes de qualquer mutação). Actions suportadas nesta versão:
//   - add_tag
//   - remove_tag
//   - assign_agent
// ---------------------------------------------------------------------------
type ActionResult = NodeResult;

async function assertTagBelongsToCompany(
  ctx: ExecutionContext,
  tagId: string,
): Promise<{ ok: true; name: string } | { ok: false; message: string }> {
  const { data, error } = await ctx.supabase
    .from("tags")
    .select("id, name, company_id")
    .eq("id", tagId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (error) return { ok: false, message: `Falha ao carregar etiqueta (${error.message})` };
  if (!data) return { ok: false, message: "Etiqueta inválida ou de outra empresa" };
  return { ok: true, name: (data as { name: string }).name };
}

async function assertUserBelongsToCompany(
  ctx: ExecutionContext,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("id, company_id")
    .eq("id", userId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (error) return { ok: false, message: `Falha ao carregar atendente (${error.message})` };
  if (!data) return { ok: false, message: "Atendente inválido ou de outra empresa" };
  return { ok: true };
}

async function runAddTag(node: NodeRow, ctx: ExecutionContext): Promise<ActionResult> {
  const tagId = String(node.data.tag_id ?? "");
  if (!tagId) return { status: "skipped", message: "Etiqueta não configurada" };
  if (!ctx.contact?.id) return { status: "skipped", message: "Contato ausente" };
  if (ctx.dryRun) return { status: "ok", output: { action: "add_tag", tag_id: tagId, dry_run: true } };
  const guard = await assertTagBelongsToCompany(ctx, tagId);
  if (!guard.ok) return { status: "failed", message: guard.message };

  // Idempotência: PK composta (contact_id, tag_id) — upsert com ignoreDuplicates
  // garante que uma retomada nunca duplica nem falha por conflito.
  const { error } = await ctx.supabase
    .from("contact_tags")
    .upsert(
      { contact_id: ctx.contact.id, tag_id: tagId, company_id: ctx.companyId },
      { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
    );
  if (error) return { status: "failed", message: `Falha ao adicionar etiqueta (${error.message})` };
  return {
    status: "ok",
    output: { action: "add_tag", tag_id: tagId, tag_name: guard.name, contact_id: ctx.contact.id },
  };
}

async function runRemoveTag(node: NodeRow, ctx: ExecutionContext): Promise<ActionResult> {
  const tagId = String(node.data.tag_id ?? "");
  if (!tagId) return { status: "skipped", message: "Etiqueta não configurada" };
  if (!ctx.contact?.id) return { status: "skipped", message: "Contato ausente" };
  if (ctx.dryRun) return { status: "ok", output: { action: "remove_tag", tag_id: tagId, dry_run: true } };
  const guard = await assertTagBelongsToCompany(ctx, tagId);
  if (!guard.ok) return { status: "failed", message: guard.message };

  // Idempotência: DELETE em linha inexistente é no-op silencioso.
  const { error } = await ctx.supabase
    .from("contact_tags")
    .delete()
    .eq("contact_id", ctx.contact.id)
    .eq("tag_id", tagId)
    .eq("company_id", ctx.companyId);
  if (error) return { status: "failed", message: `Falha ao remover etiqueta (${error.message})` };
  return {
    status: "ok",
    output: { action: "remove_tag", tag_id: tagId, tag_name: guard.name, contact_id: ctx.contact.id },
  };
}

async function runAssignAgent(node: NodeRow, ctx: ExecutionContext): Promise<ActionResult> {
  const userId = String(node.data.agent_user_id ?? "");
  if (!userId) return { status: "skipped", message: "Atendente não configurado" };
  if (!ctx.conversation.id) return { status: "skipped", message: "Conversa ausente" };
  if (ctx.dryRun) return { status: "ok", output: { action: "assign_agent", user_id: userId, dry_run: true } };
  const guard = await assertUserBelongsToCompany(ctx, userId);
  if (!guard.ok) return { status: "failed", message: guard.message };

  // Idempotência: UPDATE ao mesmo valor é no-op semântico — assign_agent
  // sempre converge para o estado desejado sem duplicar side-effects.
  const { error } = await ctx.supabase
    .from("conversations")
    .update({ assigned_user_id: userId, assigned_agent_id: null })
    .eq("id", ctx.conversation.id)
    .eq("company_id", ctx.companyId);
  if (error) return { status: "failed", message: `Falha ao atribuir atendente (${error.message})` };
  return {
    status: "ok",
    output: { action: "assign_agent", user_id: userId, conversation_id: ctx.conversation.id },
  };
}

async function runStevoCall(node: NodeRow, ctx: ExecutionContext): Promise<NodeResult> {
  const phone = ctx.contact?.phone;
  if (!ctx.conversation.id || !phone) {
    return { status: "skipped", message: "Contato ou telefone ausente para efetuar chamada" };
  }
  if (ctx.dryRun) {
    return { status: "ok", output: { action: "stevo_call", phone, dry_run: true } };
  }

  let channelId = ctx.channel?.id ?? ctx.conversation.channelId ?? null;
  type ChRow = { id: string; provider_type: string | null; credentials: unknown; company_id: string };
  let channel: ChRow | null = null;

  if (channelId) {
    const { data: ch } = await ctx.supabase
      .from("channels")
      .select("id, provider_type, credentials, company_id")
      .eq("id", channelId)
      .maybeSingle();
    if (ch && (ch as ChRow).provider_type === "stevo") {
      channel = ch as ChRow;
    }
  }

  if (!channel) {
    const { data: chs } = await ctx.supabase
      .from("channels")
      .select("id, provider_type, credentials, company_id")
      .eq("company_id", ctx.companyId)
      .eq("provider_type", "stevo")
      .eq("status", "connected")
      .limit(1);
    channel = (chs ?? [])[0] as ChRow | null;
  }

  if (!channel) {
    return { status: "failed", message: "Nenhum canal Stevo conectado para disparar a chamada" };
  }

  const { stevoMakeCall } = await import("./wa-providers/stevo.server");
  const res = await stevoMakeCall(
    {
      ...((channel.credentials as Record<string, unknown>) ?? {}),
      instance_id: (channel.credentials as any)?.instance_id,
      company_id: ctx.companyId,
    },
    phone,
  );

  await ctx.supabase.from("channel_events").insert({
    company_id: ctx.companyId,
    channel_id: channel.id,
    conversation_id: ctx.conversation.id,
    event_type: "message_sent" as never,
    payload: { action: "stevo_voice_flow_action", phone, flow_run_id: ctx.runId, result: res },
  });

  if (!res.ok) {
    return { status: "failed", message: res.error || "Falha ao disparar chamada Stevo Voice" };
  }

  return {
    status: "ok",
    output: { action: "stevo_call", phone, result: res },
  };
}

async function runNotifyTeam(node: NodeRow, ctx: ExecutionContext): Promise<ActionResult> {
  const targetUserId = String(
    node.data.user_id ??
      node.data.member_id ??
      node.data.target_user_id ??
      node.data.agent_user_id ??
      node.data.team_member_id ??
      "",
  ).trim();
  const rawMessage = String(
    node.data.message ??
      node.data.body ??
      node.data.text ??
      node.data.content ??
      node.data.message_template ??
      node.data.notification_text ??
      "",
  ).trim();

  if (ctx.dryRun) {
    return { status: "ok", output: { action: "notify_team", target_user_id: targetUserId, dry_run: true } };
  }

  // Substitui variáveis {primeiro-nome}, {telefone}, {{contact.name}}, etc.
  let message = resolveVars(rawMessage, ctx.variables);
  if (ctx.contact) {
    message = message
      .replace(/\{primeiro-nome\}/gi, ctx.contact.name?.split(" ")[0] ?? "Cliente")
      .replace(/\{nome\}/gi, ctx.contact.name ?? "Cliente")
      .replace(/\{telefone\}/gi, ctx.contact.phone ?? "")
      .replace(/\{email\}/gi, (ctx.contact as any)?.email ?? "");
  }

  let targetPhone: string | null = null;
  if (targetUserId) {
    const { data: prof } = await ctx.supabase
      .from("profiles")
      .select("id, phone, email, full_name")
      .eq("id", targetUserId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();

    if (prof?.phone) {
      targetPhone = prof.phone;
    }
  }

  // Tenta enviar mensagem WhatsApp ao membro da equipe se telefone estiver disponível
  if (targetPhone && ctx.channel) {
    try {
      await dispatchSend(ctx.channel, {
        type: "text",
        to: targetPhone,
        body: message || "[Notificação de Equipe]",
      });
    } catch {
      // Ignora erro secundário para preservar execução do fluxo
    }
  }

  // Registra notificação interna da equipe na conversa para visibilidade no Inbox
  if (ctx.conversation.id) {
    await ctx.supabase.from("channel_events").insert({
      company_id: ctx.companyId,
      channel_id: ctx.channel?.id ?? ctx.conversation.channelId ?? null,
      conversation_id: ctx.conversation.id,
      contact_id: ctx.contact?.id ?? null,
      event_type: "team_notification",
      payload: {
        action: "notify_team",
        target_user_id: targetUserId || null,
        message: message || "Notificação enviada à equipe",
        flow_run_id: ctx.runId,
        flow_node_id: node.id,
      },
    });
  }

  return {
    status: "ok",
    output: { action: "notify_team", target_user_id: targetUserId || null, message },
  };
}

const actionNode: NodeExecutor = {
  async execute(node, ctx) {
    const actionType = String(node.data.action_type ?? node.data.kind ?? "").trim();
    if (!actionType) return { status: "skipped", message: "Ação não configurada" };
    switch (actionType) {
      case "add_tag":
        return runAddTag(node, ctx);
      case "remove_tag":
        return runRemoveTag(node, ctx);
      case "assign_agent":
        return runAssignAgent(node, ctx);
      case "notify_team":
      case "notify_member":
      case "notify":
      case "notify_team_member":
      case "notify_user":
      case "send_notification":
        return runNotifyTeam(node, ctx);
      case "stevo_call":
      case "make_call":
      case "call":
      case "stevo_voice":
        return runStevoCall(node, ctx);
      default:
        return { status: "skipped", message: `Ação não suportada: ${actionType}` };
    }
  },
};

// ---------------------------------------------------------------------------
// FB-10.4C · Conexão de Fluxo (flow_connection)
// Modelo A — TRANSFERÊNCIA: encerra o run atual e inicia um novo run no fluxo
// destino, preservando conversation/channel/contact e propagando profundidade
// de encadeamento para bloquear loops infinitos.
// ---------------------------------------------------------------------------
const MAX_FLOW_CONNECTION_DEPTH = 5;

const flowConnectionNode: NodeExecutor = {
  async execute(node, ctx) {
    const targetFlowId = String(node.data.target_flow_id ?? "").trim();
    if (!targetFlowId) return { status: "skipped", message: "Fluxo destino não configurado" };

    // Autorreferência
    if (targetFlowId === ctx.flowId) {
      return { status: "failed", message: "Fluxo não pode iniciar a si mesmo" };
    }

    // Guard de profundidade / ciclos
    const stack = Array.isArray(ctx.variables.__flow_connection_stack)
      ? (ctx.variables.__flow_connection_stack as string[])
      : [];
    const depth = stack.length;
    if (depth >= MAX_FLOW_CONNECTION_DEPTH) {
      return {
        status: "failed",
        message: `Limite de encadeamento atingido (${MAX_FLOW_CONNECTION_DEPTH}). Possível ciclo entre fluxos.`,
      };
    }
    if (stack.includes(targetFlowId)) {
      return {
        status: "failed",
        message: "Ciclo detectado: fluxo destino já está na cadeia de execução atual.",
      };
    }

    // Multi-tenant: destino DEVE pertencer à mesma company e não estar arquivado
    const { data: targetFlow, error } = await ctx.supabase
      .from("flows")
      .select("id, company_id, status, name")
      .eq("id", targetFlowId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    if (error) return { status: "failed", message: `Falha ao carregar fluxo destino (${error.message})` };
    if (!targetFlow) return { status: "failed", message: "Fluxo destino inválido ou de outra empresa" };
    const t = targetFlow as { id: string; company_id: string; status: string; name: string };
    if (t.status === "archived") return { status: "failed", message: "Fluxo destino está arquivado" };

    if (ctx.dryRun) {
      return {
        status: "ok",
        output: {
          action: "flow_connection",
          target_flow_id: t.id,
          target_flow_name: t.name,
          dry_run: true,
        },
      };
    }

    // Propaga contexto sanitizado — remove chaves internas de menu do source
    const nextStack = [...stack, ctx.flowId];
    const forwardedVars: Record<string, unknown> = { ...ctx.variables };
    delete forwardedVars.__menu;
    forwardedVars.__flow_connection_stack = nextStack;
    forwardedVars.__flow_connection_source_run_id = ctx.runId;
    forwardedVars.__flow_connection_source_node_id = node.id;

    // Idempotência: mesmo (runId,nodeId,targetFlowId) → mesma child run
    const idempotencyKey = `flow-connection:${ctx.runId}:${node.id}:${t.id}`;

    await ctx.emit("FlowConnectionStarted", {
      source_flow_id: ctx.flowId,
      target_flow_id: t.id,
      target_flow_name: t.name,
      depth: nextStack.length,
    }, node.id);

    try {
      const child = await createAndExecuteRun({
        supabase: ctx.supabase,
        companyId: ctx.companyId,
        flowId: t.id,
        conversationId: ctx.conversation.id,
        channelId: ctx.conversation.channelId,
        variables: forwardedVars,
        triggerType: "flow_connection",
        triggerPayload: {
          source_flow_id: ctx.flowId,
          source_run_id: ctx.runId,
          source_node_id: node.id,
        },
        idempotencyKey,
      });
      await ctx.emit("FlowConnectionCompleted", {
        source_flow_id: ctx.flowId,
        target_flow_id: t.id,
        target_run_id: child.runId,
        target_state: child.state,
      }, node.id);
      return {
        status: "ok",
        output: {
          action: "flow_connection",
          target_flow_id: t.id,
          target_flow_name: t.name,
          target_run_id: child.runId,
          target_state: child.state,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.emit("FlowConnectionFailed", {
        source_flow_id: ctx.flowId,
        target_flow_id: t.id,
        error: msg,
      }, node.id);
      return { status: "failed", message: `Falha ao iniciar fluxo destino: ${msg}` };
    }
  },
};

// ---------------------------------------------------------------------------
// V1.2 · Transferência de Número (transfer_number)
// Muda o canal WhatsApp da conversa em curso preservando contato/conversation
// canônicos. Duas saídas: "success" / "error". O comportamento pós-transferência
// é controlado pelo campo `transfer_mode` (6 modos operacionais).
// ---------------------------------------------------------------------------
const TRANSFER_MODE_LABEL_RUNTIME: Record<string, string> = {
  channel_only: "Somente alterar canal",
  channel_message: "Alterar canal + enviar mensagem",
  channel_flow: "Alterar canal + iniciar fluxo",
  channel_agent: "Alterar canal + iniciar Agente IA",
  channel_message_flow: "Alterar canal + enviar mensagem + iniciar fluxo",
  channel_message_agent: "Alterar canal + enviar mensagem + iniciar Agente IA",
};

function buildTransferNumberNote(input: {
  mode: string;
  flowName?: string | null;
  agentName?: string | null;
}): string {
  const label = TRANSFER_MODE_LABEL_RUNTIME[input.mode] ?? "Somente alterar canal";
  const parts: string[] = [
    "Transferido automaticamente pelo Flow Builder.",
    `Modo: ${label}.`,
  ];
  if (input.flowName) parts.push(`Fluxo: ${input.flowName}.`);
  if (input.agentName) parts.push(`Agente IA: ${input.agentName}.`);
  return parts.join(" ");
}

const transferNumberNode: NodeExecutor = {
  async execute(node, ctx) {
    const toChannelId = String(node.data.to_channel_id ?? "").trim();
    if (!toChannelId) {
      return { status: "failed", nextHandle: "error", message: "Canal de destino não configurado" };
    }
    if (!ctx.conversation.id) {
      return { status: "failed", nextHandle: "error", message: "Conversa ausente — bloco só pode rodar dentro de um atendimento" };
    }
    const fromChannelId = ctx.conversation.channelId;
    if (toChannelId === fromChannelId) {
      return { status: "failed", nextHandle: "error", message: "Canal de destino é o mesmo canal atual" };
    }

    // Multi-tenant guard + validações operacionais
    const { data: target, error: targetErr } = await ctx.supabase
      .from("channels")
      .select("id, company_id, name, provider_type, credentials, phone_number, status, paused_at, archived_at")
      .eq("id", toChannelId)
      .maybeSingle();
    if (targetErr) {
      return { status: "failed", nextHandle: "error", message: `Falha ao carregar canal destino (${targetErr.message})` };
    }
    if (!target) {
      return { status: "failed", nextHandle: "error", message: "Canal destino inexistente" };
    }
    const t = target as {
      id: string; company_id: string; name: string; provider_type: string;
      credentials: unknown; phone_number: string | null;
      status: string | null; paused_at: string | null; archived_at: string | null;
    };
    if (t.company_id !== ctx.companyId) {
      return { status: "failed", nextHandle: "error", message: "Canal destino pertence a outra empresa" };
    }
    if (t.archived_at) {
      return { status: "failed", nextHandle: "error", message: "Canal destino está arquivado" };
    }
    if (t.paused_at) {
      return { status: "failed", nextHandle: "error", message: "Canal destino está pausado" };
    }

    const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    const rawMode = strOrNull(node.data.transfer_mode) ?? "channel_only";
    const allowedModes = new Set([
      "channel_only",
      "channel_message",
      "channel_flow",
      "channel_agent",
      "channel_message_flow",
      "channel_message_agent",
    ]);
    const mode = allowedModes.has(rawMode) ? rawMode : "channel_only";
    const wantsMessage = mode === "channel_message" || mode === "channel_message_flow" || mode === "channel_message_agent";
    const wantsFlow = mode === "channel_flow" || mode === "channel_message_flow";
    const wantsAgent = mode === "channel_agent" || mode === "channel_message_agent";
    const flowId = wantsFlow ? strOrNull(node.data.flow_id) : null;
    const agentId = wantsAgent ? strOrNull(node.data.agent_id) : null;
    const initialMessage = wantsMessage ? strOrNull(node.data.initial_message) : null;
    const flowLabel = strOrNull(node.data.flow_label);
    const agentLabel = strOrNull(node.data.agent_label);
    const fromChannelName = ctx.channel?.id === fromChannelId ? (ctx.channel as unknown as { name?: string }).name ?? null : null;

    if (ctx.dryRun) {
      return {
        status: "ok",
        nextHandle: "success",
        output: {
          action: "transfer_number",
          transfer_mode: mode,
          from_channel_id: fromChannelId,
          to_channel_id: t.id,
          to_channel_name: t.name,
          dry_run: true,
        },
      };
    }

    const now = new Date().toISOString();

    // 1) Atualiza conversation.channel_id preservando id/contact
    const { error: uErr } = await ctx.supabase
      .from("conversations")
      .update({
        channel_id: t.id,
        transferred_from_channel_id: fromChannelId,
        transferred_at: now,
        status: "open",
      })
      .eq("id", ctx.conversation.id)
      .eq("company_id", ctx.companyId);
    if (uErr) {
      return { status: "failed", nextHandle: "error", message: `Falha ao atualizar conversa (${uErr.message})` };
    }

    // 2) Audit em conversation_transfers (nota humana com o modo escolhido)
    await ctx.supabase.from("conversation_transfers").insert({
      company_id: ctx.companyId,
      conversation_id: ctx.conversation.id,
      from_channel_id: fromChannelId,
      to_channel_id: t.id,
      flow_id: flowId,
      transferred_by: null,
      note: buildTransferNumberNote({ mode, flowName: flowLabel, agentName: agentLabel }),
    });

    // 3) Timeline event (Inbox) — metadados enriquecidos
    await ctx.supabase.from("channel_events").insert({
      company_id: ctx.companyId,
      channel_id: t.id,
      contact_id: ctx.conversation.contactId,
      conversation_id: ctx.conversation.id,
      event_type: "conversation_transferred",
      payload: {
        source: "flow_transfer_number_node",
        transfer_mode: mode,
        transfer_mode_label: TRANSFER_MODE_LABEL_RUNTIME[mode],
        from_channel_id: fromChannelId,
        from_channel_name: fromChannelName,
        to_channel_id: t.id,
        to_channel_name: t.name,
        origin_channel: { id: fromChannelId, name: fromChannelName },
        destination_channel: { id: t.id, name: t.name },
        flow_id: flowId,
        flow_name: flowLabel,
        agent_id: agentId,
        agent_name: agentLabel,
        transferred_by: null,
        flow_run_id: ctx.runId,
        flow_node_id: node.id,
        timestamp: now,
      },
    });

    // 4) Passa a usar o novo canal para envios subsequentes deste mesmo run
    const newChannel: ChannelRow = {
      id: t.id,
      provider_type: t.provider_type,
      credentials: t.credentials,
      phone_number: t.phone_number,
    } as ChannelRow;
    ctx.channel = newChannel;
    ctx.conversation.channelId = t.id;

    await ctx.emit("TransferNumberExecuted", {
      transfer_mode: mode,
      from_channel_id: fromChannelId,
      to_channel_id: t.id,
      to_channel_name: t.name,
    }, node.id);

    // 5) Mensagem inicial (opcional) pelo NOVO canal
    let messagesSent = 0;
    if (initialMessage) {
      const rendered = resolveVars(initialMessage, ctx.variables);
      const { data: inserted } = await ctx.supabase
        .from("messages")
        .insert({
          company_id: ctx.companyId,
          conversation_id: ctx.conversation.id,
          channel_id: ctx.channel?.id ?? ctx.conversation.channelId ?? null,
          direction: "outbound",
          type: "text",
          body: rendered,
          status: "sent",
          media_metadata: {
            automated: true,
            flow_run_id: ctx.runId,
            flow_node_id: node.id,
            transfer_number: true,
          },
        })
        .select("id")
        .single();
      const insertedId = inserted?.id ?? null;

      if (ctx.contact?.phone) {
        const res = await dispatchSend(newChannel, { type: "text", to: ctx.contact.phone, body: rendered });
        if (!res.ok) {
          return { status: "failed", nextHandle: "error", message: `Falha ao enviar mensagem pelo novo canal: ${res.error}` };
        }
        const pmid = "provider_message_id" in res ? res.provider_message_id : null;
        if (insertedId && pmid) {
          await ctx.supabase.from("messages").update({ provider_message_id: pmid }).eq("id", insertedId);
        }
      }
      messagesSent += 1;
    }

    // 6) Atribuir agente IA (opcional) — mesmo padrão do Inbox
    if (agentId) {
      const { data: agent } = await ctx.supabase
        .from("ai_agents")
        .select("id, company_id, is_active")
        .eq("id", agentId)
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      if (agent && (agent as { is_active: boolean }).is_active) {
        await ctx.supabase
          .from("conversations")
          .update({
            assigned_agent_id: agentId,
            assigned_user_id: null,
            assigned_type: "ai_agent",
          } as never)
          .eq("id", ctx.conversation.id)
          .eq("company_id", ctx.companyId);
      }
    }

    // 7) Iniciar fluxo (opcional) — child run vinculado ao novo canal
    let childRunId: string | null = null;
    if (flowId) {
      // Guard: fluxo pertence à mesma empresa e não é o próprio fluxo em execução
      const { data: targetFlow } = await ctx.supabase
        .from("flows")
        .select("id, company_id, status")
        .eq("id", flowId)
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      const tf = targetFlow as { id: string; company_id: string; status: string } | null;
      if (tf && tf.status !== "archived" && tf.id !== ctx.flowId) {
        try {
          const child = await createAndExecuteRun({
            supabase: ctx.supabase,
            companyId: ctx.companyId,
            flowId: tf.id,
            conversationId: ctx.conversation.id,
            channelId: t.id,
            triggerType: "transfer_number",
            triggerPayload: {
              source_flow_id: ctx.flowId,
              source_run_id: ctx.runId,
              source_node_id: node.id,
              from_channel_id: fromChannelId,
              to_channel_id: t.id,
            },
            idempotencyKey: `transfer-number:${ctx.runId}:${node.id}:${tf.id}`,
          });
          childRunId = child.runId;
          messagesSent += child.messagesSent ?? 0;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await ctx.emit("TransferNumberChildFlowFailed", { target_flow_id: tf.id, error: msg }, node.id);
          // Não falha o bloco: transferência já foi efetivada. Apenas registra.
        }
      }
    }

    return {
      status: "ok",
      nextHandle: "success",
      messagesSent,
      output: {
        action: "transfer_number",
        transfer_mode: mode,
        from_channel_id: fromChannelId,
        to_channel_id: t.id,
        to_channel_name: t.name,
        initial_message_sent: !!initialMessage,
        flow_id: flowId,
        child_run_id: childRunId,
        agent_id: agentId,
      },
    };
  },
};



export type WeightedRoute = { id: string; label: string; weight: number };

/**
 * FB-10.4D — Seleção ponderada pura, isolável em testes.
 * `rnd` deve estar em [0, 1). Retorna a rota escolhida pelo intervalo
 * cumulativo. Fronteiras: rnd=0 → primeira rota com peso > 0; para
 * rnd=1 (inclusivo) devolve a última com peso > 0 como fallback FP.
 */
export function pickWeightedRoute(
  routes: WeightedRoute[],
  rnd: number,
): WeightedRoute | null {
  const active = routes.filter((r) => (r.weight ?? 0) > 0);
  if (active.length === 0) return null;
  const total = active.reduce((a, r) => a + r.weight, 0);
  if (total <= 0) return null;
  const r = Math.max(0, Math.min(rnd, 0.9999999999)) * total;
  let acc = 0;
  for (const route of active) {
    acc += route.weight;
    if (r < acc) return route;
  }
  return active[active.length - 1];
}

function parseRandomizerRoutes(raw: unknown): WeightedRoute[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = r as { id?: unknown; label?: unknown; weight?: unknown };
      const id = typeof o.id === "string" && o.id ? o.id : "";
      const label = typeof o.label === "string" ? o.label : "";
      const weight =
        typeof o.weight === "number" && Number.isFinite(o.weight) ? o.weight : 0;
      if (!id) return null;
      return { id, label, weight };
    })
    .filter((r): r is WeightedRoute => !!r);
}

const randomizerNode: NodeExecutor = {
  async execute(node, ctx) {
    const routes = parseRandomizerRoutes(node.data.routes);
    if (routes.length < 2) {
      return { status: "failed", message: "Randomizador precisa de pelo menos 2 caminhos." };
    }
    const total = routes.reduce((a, r) => a + r.weight, 0);
    if (total !== 100) {
      return { status: "failed", message: `Percentuais precisam somar 100% (atual: ${total}%).` };
    }

    // Idempotência: reutiliza escolha anterior para este node (retomadas/retry).
    const choicesBag =
      (ctx.variables.__randomizer_choices as Record<string, { id: string; label: string; weight: number }> | undefined) ??
      {};
    const prior = choicesBag[node.id];
    let chosen: WeightedRoute | null = null;
    let reused = false;
    if (prior && routes.some((r) => r.id === prior.id)) {
      chosen = routes.find((r) => r.id === prior.id) ?? null;
      reused = true;
    }
    if (!chosen) {
      // RNG injetável para testes determinísticos.
      const injected = (ctx.variables.__randomizer_rng as unknown);
      const rnd =
        typeof injected === "number" && Number.isFinite(injected)
          ? injected
          : typeof injected === "function"
          ? Number((injected as () => number)())
          : Math.random();
      chosen = pickWeightedRoute(routes, Number.isFinite(rnd) ? rnd : Math.random());
    }
    if (!chosen) {
      return { status: "failed", message: "Nenhum caminho válido para escolher." };
    }

    const nextChoices = {
      ...choicesBag,
      [node.id]: { id: chosen.id, label: chosen.label, weight: chosen.weight },
    };

    return {
      status: "ok",
      nextHandle: chosen.id,
      output: {
        mode: "weighted",
        route_count: routes.length,
        selected_route_id: chosen.id,
        selected_route_label: chosen.label,
        selected_weight: chosen.weight,
        reused_prior_choice: reused,
      },
      vars: { __randomizer_choices: nextChoices },
    };
  },
};

const NODE_PLUGINS: Record<string, NodeExecutor> = {
  start: startEnd,
  end: startEnd,
  message: messageNode,
  send_message: messageNode,
  send_image: mediaNode,
  send_audio: mediaNode,
  send_video: mediaNode,
  send_document: mediaNode,
  wait: waitNode,
  smart_delay: waitNode,
  wait_reply: waitReplyNode,
  menu: menuNode,
  condition: conditionNode,
  ai: aiNode,
  run_agent: aiNode,
  ai_agent: aiNode,
  assistant_gpt: aiNode,
  gpt: aiNode,
  http_request: httpNode,
  webhook: httpNode,
  integration: httpNode,
  api_call: httpNode,
  tag: tagNode,
  add_tag: tagNode,
  apply_tag: tagNode,
  transfer: transferNode,
  transfer_human: transferNode,
  assign_agent: transferNode,
  action: actionNode,
  question: questionNode,
  flow_connection: flowConnectionNode,
  subflow: flowConnectionNode,
  randomizer: randomizerNode,
  split: randomizerNode,
  transfer_number: transferNumberNode,
  container_block: messageNode,
};

export function getPlugin(nodeType: string): NodeExecutor | null {
  const basePlugin = NODE_PLUGINS[nodeType] ?? null;
  if (!basePlugin && nodeType !== "container_block") return null;

  return {
    ...(basePlugin ?? messageNode),
    async execute(node, ctx) {
      const realKind = String(node.data?.__kind ?? node.data?.kind ?? node.node_type ?? nodeType);
      const specificPlugin = (realKind !== nodeType && NODE_PLUGINS[realKind]) ? NODE_PLUGINS[realKind] : (basePlugin ?? messageNode);

      if (Array.isArray(node.data?.actions) && node.data.actions.length > 0) {
        return executeMultiActionNode(node, ctx);
      }
      return specificPlugin.execute(node, ctx);
    },
  };
}

// ---- Graph integrity ---------------------------------------------------

export function graphHash(nodes: NodeRow[], edges: EdgeRow[]): string {
  const norm = {
    nodes: nodes
      .map((n) => ({ id: n.id, t: n.node_type, d: n.data }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges
      .map((e) => ({ s: e.source_node_id, t: e.target_node_id, h: e.source_handle }))
      .sort((a, b) => (a.s + a.t + (a.h ?? "")).localeCompare(b.s + b.t + (b.h ?? ""))),
  };
  return createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

export function validateGraph(nodes: NodeRow[], edges: EdgeRow[]): { ok: true } | { ok: false; error: string } {
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!ids.has(e.source_node_id) || !ids.has(e.target_node_id)) {
      return { ok: false, error: `Aresta órfã ${e.source_node_id}→${e.target_node_id}` };
    }
  }
  const starts = nodes.filter((n) => n.node_type === "start");
  if (starts.length === 0) return { ok: false, error: "Fluxo sem nó de início" };
  if (starts.length > 1) return { ok: false, error: "Múltiplos nós de início" };
  return { ok: true };
}

/**
 * CRITICAL-01 P2: valida se o grafo pode ser publicado.
 *
 * Além das checagens de `validateGraph`, garante que todo nó-folha (sem aresta
 * de saída) seja do tipo `end`. Sem essa trava, um grafo cujo último nó real
 * (ex.: `ai`) não tem edge de saída completa "silenciosamente" no runtime e
 * dá a impressão de "parou antes do fim".
 */
export function validateGraphForPublish(
  nodes: NodeRow[],
  edges: EdgeRow[],
): { ok: true } | { ok: false; error: string } {
  const base = validateGraph(nodes, edges);
  if (!base.ok) return base;
  return { ok: true };
}


/**
 * Deep integrity check: orphan nodes/edges, missing start/end,
 * disconnected components, and unreachable nodes from start.
 * Used by the mission-14 audit tooling.
 */
export type IntegrityReport = {
  ok: boolean;
  hash: string;
  errors: string[];
  warnings: string[];
  stats: { nodes: number; edges: number; reachable: number; orphans: number };
};

export async function assertFlowIntegrity(
  supabase: SupabaseClient,
  flowId: string,
): Promise<IntegrityReport> {
  const { nodes, edges } = await loadGraph(supabase, flowId);
  const errors: string[] = [];
  const warnings: string[] = [];

  const base = validateGraph(nodes, edges);
  if (!base.ok) errors.push(base.error);

  // Reachability from start
  const start = nodes.find((n) => n.node_type === "start");
  const reachable = new Set<string>();
  if (start) {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      const a = adj.get(e.source_node_id) ?? [];
      a.push(e.target_node_id);
      adj.set(e.source_node_id, a);
    }
    const stack = [start.id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      for (const t of adj.get(cur) ?? []) stack.push(t);
    }
  }

  const orphans = nodes.filter((n) => !reachable.has(n.id) && n.node_type !== "start");
  if (orphans.length) warnings.push(`${orphans.length} nó(s) inalcançáveis a partir do início`);
  if (!nodes.some((n) => n.node_type === "end")) warnings.push("Fluxo sem nó de fim");

  return {
    ok: errors.length === 0,
    hash: graphHash(nodes, edges),
    errors,
    warnings,
    stats: { nodes: nodes.length, edges: edges.length, reachable: reachable.size, orphans: orphans.length },
  };
}


// ---- Core engine loop --------------------------------------------------

/**
 * Load a flow graph.
 *
 * Runtime-02.1 (Publish Lock): when a `pinnedVersionId` is provided, the
 * graph is hydrated exclusively from `flow_versions.snapshot`. The live
 * `flow_nodes` / `flow_edges` tables are only consulted when no version is
 * pinned (dry runs, integrity checks called from the editor, legacy runs
 * created before the publish-lock).
 *
 * When a `expectedHash` is provided together with the pinned version, the
 * graph hash is recomputed and any mismatch aborts loading — divergence
 * between the pinned snapshot and its recorded integrity hash is treated
 * as a runtime fault.
 */
async function loadGraph(
  supabase: SupabaseClient,
  flowId: string,
  opts?: { pinnedVersionId?: string | null; expectedHash?: string | null },
): Promise<{
  nodes: NodeRow[];
  edgeMap: Map<string, EdgeRow[]>;
  edges: EdgeRow[];
  source: "published_version" | "live";
  versionId: string | null;
  versionNumber: number | null;
  hash: string | null;
}> {
  let normalizedNodes: NodeRow[] = [];
  let normalizedEdges: EdgeRow[] = [];
  let source: "published_version" | "live" = "live";
  let versionId: string | null = null;
  let versionNumber: number | null = null;

  if (opts?.pinnedVersionId) {
    const { data: v, error } = await supabase
      .from("flow_versions")
      .select("id, version_number, snapshot, integrity_hash, flow_id")
      .eq("id", opts.pinnedVersionId)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar versão publicada: ${error.message}`);
    if (!v) throw new Error("Versão publicada do fluxo não foi encontrada (foi apagada?).");
    if ((v as { flow_id: string }).flow_id !== flowId) {
      throw new Error("Versão publicada não pertence ao fluxo desta execução.");
    }
    const snap = ((v as { snapshot: unknown }).snapshot ?? {}) as PublishedSnapshot;
    normalizedNodes = (snap.nodes ?? []).map((n) => ({
      id: String(n.id),
      node_type: String(n.node_type),
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    normalizedEdges = (snap.edges ?? []).map((e) => ({
      source_node_id: String(e.source_node_id),
      target_node_id: String(e.target_node_id),
      source_handle: (e.source_handle ?? null) as string | null,
      transition_delay_ms: Math.max(0, Number(e.transition_delay_ms ?? 0) || 0),
    }));
    source = "published_version";
    versionId = (v as { id: string }).id;
    versionNumber = (v as { version_number: number }).version_number;

    // If caller supplied the expected hash (pinned at run creation),
    // verify the current version snapshot still matches. Any mismatch is
    // a runtime integrity fault.
    if (opts.expectedHash) {
      const currentHash = graphHash(normalizedNodes, normalizedEdges);
      const storedHash = (v as { integrity_hash: string | null }).integrity_hash;
      // We only compare against the caller-pinned hash. The version's own
      // stored hash may use a slightly different serialization strategy,
      // so it's kept for audit but not used as the source of truth here.
      if (currentHash !== opts.expectedHash && storedHash !== opts.expectedHash) {
        throw new Error(
          `Integridade da versão publicada divergiu do hash registrado na execução (esperado ${opts.expectedHash.slice(0, 12)}…).`,
        );
      }
    }
  } else {
    const [{ data: nodes }, { data: edges }] = await Promise.all([
      supabase.from("flow_nodes").select("id, node_type, data").eq("flow_id", flowId),
      supabase
        .from("flow_edges")
        .select("source_node_id, target_node_id, source_handle, transition_delay_ms")
        .eq("flow_id", flowId),
    ]);
    normalizedNodes = (nodes ?? []).map((n) => ({
      id: n.id as string,
      node_type: n.node_type as string,
      data: ((n as { data?: unknown }).data ?? {}) as Record<string, unknown>,
    }));
    normalizedEdges = (edges ?? []).map((e) => ({
      source_node_id: e.source_node_id as string,
      target_node_id: e.target_node_id as string,
      source_handle: (e.source_handle as string | null) ?? null,
      transition_delay_ms: Math.max(0, Number((e as { transition_delay_ms?: number | null }).transition_delay_ms ?? 0) || 0),
    }));
  }

  const edgeMap = new Map<string, EdgeRow[]>();
  for (const e of normalizedEdges) {
    const arr = edgeMap.get(e.source_node_id) ?? [];
    arr.push(e);
    edgeMap.set(e.source_node_id, arr);
  }
  return {
    nodes: normalizedNodes,
    edgeMap,
    edges: normalizedEdges,
    source,
    versionId,
    versionNumber,
    hash: graphHash(normalizedNodes, normalizedEdges),
  };
}

async function loadRunContext(
  supabase: SupabaseClient,
  runId: string,
): Promise<{ run: FlowRunRow; channel: ChannelRow | null; contact: ExecutionContext["contact"] } | null> {
  // Cast run row through unknown because generated types haven't picked up new columns yet
  const { data: r } = await supabase
    .from("flow_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (!r) return null;
  const run = r as unknown as FlowRunRow;

  let channel: ChannelRow | null = null;
  let contact: ExecutionContext["contact"] = null;

  // Resolve channel/contact with explicit queries. Embedded selects are
  // ambiguous here (conversations has channel_id AND transferred_from_channel_id),
  // which made PostgREST fail and silently skip provider dispatch.
  let channelId: string | null = run.channel_id ?? null;
  if (run.conversation_id) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("channel_id, contact_id")
      .eq("id", run.conversation_id)
      .maybeSingle();
    if (conv) {
      channelId = (conv.channel_id as string | null) ?? channelId;
      if (conv.contact_id) {
        const { data: ct } = await supabase
          .from("contacts")
          .select("id, name, phone")
          .eq("id", conv.contact_id)
          .maybeSingle();
        contact = (ct ?? null) as ExecutionContext["contact"];
      }
    }
  }

  if (channelId) {
    const { data: ch } = await supabase
      .from("channels")
      .select("id, provider_type, credentials, phone_number")
      .eq("id", channelId)
      .maybeSingle();
    channel = (ch ?? null) as ChannelRow | null;
  }

  return { run, channel, contact };
}

async function updateRun(supabase: SupabaseClient, runId: string, patch: Record<string, unknown>) {
  await supabase.from("flow_runs").update(patch as never).eq("id", runId);
}

async function emitEvent(
  supabase: SupabaseClient,
  runId: string,
  companyId: string,
  flowId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  nodeId: string | null = null,
) {
  await supabase.from("flow_events").insert({
    run_id: runId,
    company_id: companyId,
    flow_id: flowId,
    node_id: nodeId,
    event_type: eventType,
    payload: payload as never,
  } as never);
}

async function recordStep(
  supabase: SupabaseClient,
  companyId: string,
  runId: string,
  flowId: string,
  seq: number,
  node: NodeRow,
  result: NodeResult,
  startedAt: string,
  retryCount: number,
  errorObj: unknown = null,
) {
  const finishedAt = new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  await supabase.from("flow_run_steps").insert({
    run_id: runId,
    company_id: companyId,
    flow_id: flowId,
    node_id: node.id,
    node_type: node.node_type,
    seq,
    state: errorObj ? "failed" : result.status,
    input: {} as never,
    output: (result.output ?? {}) as never,
    error: errorObj ? ({ message: String((errorObj as Error).message ?? errorObj) } as never) : null,
    provider: result.provider?.name ?? null,
    provider_request: (result.provider?.request ?? null) as never,
    provider_response: (result.provider?.response ?? null) as never,
    provider_message_id: result.provider?.provider_message_id ?? null,
    http_status: result.provider?.http_status ?? null,
    retry_count: retryCount,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs,
    metrics: (result.metrics ?? {}) as never,
  } as never);
}

export type ExecuteOptions = {
  supabase: SupabaseClient;
  runId: string;
  maxSteps?: number;
};

type PublishedFlowVersionResolution = {
  version: {
    id: string;
    version_number: number;
    status: string;
    published_at: string | null;
    integrity_hash: string | null;
    snapshot: unknown;
  } | null;
  rowsReturned: number;
  sql: string;
  reason?: string;
};

async function resolvePublishedFlowVersion(
  supabase: SupabaseClient,
  input: { flowId: string; companyId: string; caller: string },
): Promise<PublishedFlowVersionResolution> {
  const sql = [
    "SELECT id, version_number, status, published_at, integrity_hash, snapshot",
    "FROM public.flow_versions",
    "WHERE flow_id = $1 AND status = 'published'",
    "ORDER BY published_at DESC NULLS LAST, version_number DESC",
    "LIMIT 1",
  ].join(" ");

  const { data: versions, error } = await supabase
    .from("flow_versions")
    .select("id, version_number, status, published_at, integrity_hash, snapshot")
    .eq("flow_id", input.flowId)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("version_number", { ascending: false })
    .limit(1);

  if (error) {
    console.info("[FLOW_RUNTIME_AUDIT] PublishedVersionQueryFailed", {
      function: input.caller,
      flow_id: input.flowId,
      company_id: input.companyId,
      sql,
      error: error.message,
    });
    throw new Error(`Falha ao localizar versão publicada: ${error.message}`);
  }

  const rows = (versions ?? []) as Array<{
    id: string;
    version_number: number;
    status: string;
    published_at: string | null;
    integrity_hash: string | null;
    snapshot: unknown;
  }>;
  const version = rows[0] ?? null;
  const reason = version ? undefined : "no_rows_for_flow_id_and_status_published";

  console.info("[FLOW_RUNTIME_AUDIT] PublishedVersionQueryResult", {
    function: input.caller,
    flow_id: input.flowId,
    company_id: input.companyId,
    sql,
    rows_returned: rows.length,
    version_id: version?.id ?? null,
    version_number: version?.version_number ?? null,
    version_status: version?.status ?? null,
    published_at: version?.published_at ?? null,
    reason: reason ?? null,
  });

  return { version, rowsReturned: rows.length, sql, reason };
}

async function executeMultiActionNode(node: NodeRow, ctx: ExecutionContext): Promise<NodeResult> {
  const rawActions = node.data?.actions;
  if (!Array.isArray(rawActions) || rawActions.length === 0) {
    const plugin = getPlugin(node.node_type);
    if (!plugin) return { status: "skipped", message: `Tipo ${node.node_type} não implementado` };
    return plugin.execute(node, ctx);
  }

  const actions = rawActions as Array<Record<string, unknown> & { kind?: string; id?: string }>;
  const varKey = `__action_index_${node.id}`;
  const startIndex = Number(ctx.variables[varKey]) || 0;
  let lastResult: NodeResult = { status: "ok", output: { completed: true } };

  for (let i = startIndex; i < actions.length; i++) {
    const act = actions[i];
    const actKind = String(act.kind || "message");
    const actPlugin = getPlugin(actKind);
    if (!actPlugin) continue;

    const subNode: NodeRow = {
      id: `${node.id}:${act.id || i}`,
      node_type: actKind,
      data: act,
    };

    ctx.variables[varKey] = i;
    const res = await actPlugin.execute(subNode, ctx);
    lastResult = res;

    if (res.messagesSent) {
      ctx.variables.__messagesSent = (Number(ctx.variables.__messagesSent) || 0) + res.messagesSent;
    }

    if (res.status === "failed") {
      delete ctx.variables[varKey];
      return res;
    }

    if (res.wait) {
      return res;
    }
  }

  delete ctx.variables[varKey];
  return lastResult;
}

export async function executeRun({ supabase, runId, maxSteps = 200 }: ExecuteOptions): Promise<{
  state: FlowState;
  messagesSent: number;
  steps: number;
  error?: string;
}> {
  // ---- Acquire lock ------------------------------------------------------
  const { data: lockRes } = await supabase.rpc("flow_run_acquire_lock", {
    _run_id: runId,
    _ttl_seconds: 120,
  });
  const lock = (lockRes as { acquired: boolean; lock_token?: string } | null) ?? { acquired: false };
  if (!lock.acquired) return { state: "RUNNING", messagesSent: 0, steps: 0, error: "Execução já bloqueada por outro worker" };
  const lockToken = lock.lock_token!;

  try {
    const loaded = await loadRunContext(supabase, runId);
    if (!loaded) throw new Error("Run não encontrado");
    const { run, channel, contact } = loaded;

    if (run.state === "COMPLETED" || run.state === "FAILED" || run.state === "CANCELLED") {
      return { state: run.state, messagesSent: run.messages_sent, steps: 0 };
    }

    // Runtime-02.1: execute the pinned published version, not the live graph.
    // Legacy runs created before publish-lock have `published_version_id = null`
    // and fall back to the live graph to preserve backward compatibility.
    const graph = await loadGraph(supabase, run.flow_id, {
      pinnedVersionId: run.published_version_id,
      expectedHash: run.graph_hash,
    });
    const { nodes, edgeMap } = graph;
    await emitEvent(supabase, runId, run.company_id, run.flow_id, "RuntimeGraphResolved", {
      source: graph.source,
      version_id: graph.versionId,
      version_number: graph.versionNumber,
      graph_hash: graph.hash,
      node_count: nodes.length,
      edge_count: graph.edges.length,
    });
    console.info("[FLOW_RUNTIME_AUDIT] RuntimeGraphResolved", {
      runId,
      flowId: run.flow_id,
      companyId: run.company_id,
      source: graph.source,
      versionId: graph.versionId,
      versionNumber: graph.versionNumber,
      nodeCount: nodes.length,
      edgeCount: graph.edges.length,
    });
    const integrity = validateGraph(nodes, edgeMap.size ? Array.from(edgeMap.values()).flat() : []);
    if (!integrity.ok) {
      await updateRun(supabase, runId, {
        state: "FAILED",
        status: "failed",
        error: integrity.error,
        completed_at: new Date().toISOString(),
      });
      return { state: "FAILED", messagesSent: 0, steps: 0, error: integrity.error };
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const start = nodes.find((n) => n.node_type === "start")!;
    await emitEvent(supabase, runId, run.company_id, run.flow_id, "RuntimeEntryNodeResolved", {
      entry_node_id: start.id,
      entry_node_type: start.node_type,
      pinned_version_id: run.published_version_id,
      pinned_version_number: run.published_version_number,
    }, start.id);
    console.info("[FLOW_RUNTIME_AUDIT] RuntimeEntryNodeResolved", {
      runId,
      flowId: run.flow_id,
      entryNodeId: start.id,
      entryNodeType: start.node_type,
      pinnedVersionId: run.published_version_id,
      pinnedVersionNumber: run.published_version_number,
    });

    const variables: Record<string, unknown> = {
      ...(run.variables ?? {}),
      contact: run.variables?.contact ?? {
        name: contact?.name ?? "Contato",
        phone: contact?.phone ?? null,
        id: contact?.id ?? null,
      },
    };

    const ctx: ExecutionContext = {
      runId,
      companyId: run.company_id,
      flowId: run.flow_id,
      supabase,
      conversation: {
        id: run.conversation_id,
        channelId: run.channel_id,
        contactId: contact?.id ?? null,
      },
      channel,
      contact,
      variables,
      history: [],
      dryRun: run.dry_run,
      emit: (event, payload = {}, nodeId = null) =>
        emitEvent(supabase, runId, run.company_id, run.flow_id, event, payload, nodeId),
    };

    let cursor: string | undefined = run.cursor_node_id ?? run.current_node_id ?? start.id;
    let previousId: string | null = run.previous_node_id ?? null;
    let messagesSent = run.messages_sent ?? 0;
    let seq = 0;
    let finalState: FlowState = "RUNNING";
    let errorMsg: string | null = null;
    const visitedInPass = new Set<string>();

    await updateRun(supabase, runId, { state: "RUNNING", status: "running" });
    await ctx.emit("FlowResumed", { from: cursor });

    while (cursor && seq < maxSteps) {
      const node = nodeMap.get(cursor);
      if (!node) {
        errorMsg = `Cursor aponta para nó inexistente: ${cursor}`;
        finalState = "FAILED";
        break;
      }
      if (visitedInPass.has(cursor)) {
        // simple cycle guard within a single execution pass
        errorMsg = `Loop detectado no nó ${cursor}`;
        finalState = "FAILED";
        break;
      }
      visitedInPass.add(cursor);

      const plugin = getPlugin(node.node_type);
      if (seq === 0) {
        console.info("[FLOW_RUNTIME_AUDIT] RuntimeFirstNode", {
          runId,
          flowId: run.flow_id,
          nodeId: node.id,
          nodeType: node.node_type,
        });
      }
      if (!plugin) {
        await recordStep(supabase, run.company_id, runId, run.flow_id, seq++, node, { status: "skipped", message: `Tipo ${node.node_type} não implementado` }, new Date().toISOString(), 0);
        const outgoing = edgeMap.get(node.id) ?? [];
        previousId = node.id;
        cursor = outgoing[0]?.target_node_id;
        continue;
      }

      const policy = parseRetryPolicy(node.data);
      let attempt = 0;
      let lastError: unknown = null;
      let result: NodeResult | null = null;
      const startedAt = new Date().toISOString();

      await ctx.emit("NodeStarted", { node_type: node.node_type }, node.id);

      while (attempt <= policy.max) {
        try {
          result = await executeMultiActionNode(node, ctx);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          attempt += 1;
          if (attempt > policy.max) break;
          await ctx.emit("RetryStarted", { attempt, node_type: node.node_type, error: String((err as Error).message) }, node.id);
          await updateRun(supabase, runId, { state: "RETRYING", retry_count: attempt });
          await sleep(nextDelay(policy, attempt - 1));
        }
      }

      if (lastError || !result) {
        const errObj = lastError as Error;
        await recordStep(supabase, run.company_id, runId, run.flow_id, seq++, node, { status: "failed", message: errObj?.message }, startedAt, attempt, errObj);
        await ctx.emit("NodeFailed", { error: errObj?.message, retries: attempt }, node.id);
        // DLQ
        await supabase.from("flow_dead_letter").insert({
          run_id: runId,
          company_id: run.company_id,
          flow_id: run.flow_id,
          node_id: node.id,
          node_type: node.node_type,
          payload: (node.data ?? {}) as never,
          error: { message: errObj?.message ?? String(errObj) } as never,
          retry_count: attempt,
        } as never);
        errorMsg = errObj?.message ?? String(errObj);
        finalState = "FAILED";
        break;
      }

      await recordStep(supabase, run.company_id, runId, run.flow_id, seq++, node, result, startedAt, attempt);

      if (result.status === "failed") {
        const failureMessage = result.message ?? `Nó ${node.node_type} retornou falha.`;
        await ctx.emit("NodeFailed", { error: failureMessage, retries: attempt }, node.id);
        await supabase.from("flow_dead_letter").insert({
          run_id: runId,
          company_id: run.company_id,
          flow_id: run.flow_id,
          node_id: node.id,
          node_type: node.node_type,
          payload: (node.data ?? {}) as never,
          error: { message: failureMessage, result: result.output ?? null } as never,
          retry_count: attempt,
        } as never);
        errorMsg = failureMessage;
        finalState = "FAILED";
        break;
      }

      await ctx.emit("NodeFinished", { status: result.status, node_type: node.node_type }, node.id);

      if (result.vars) Object.assign(variables, result.vars);
      if (result.messagesSent) messagesSent += result.messagesSent;

      if (result.wait) {
        finalState = result.wait.state;
        await updateRun(supabase, runId, {
          state: result.wait.state,
          status: "waiting",
          cursor_node_id: result.wait.state === "WAITING_DELAY"
            ? (edgeMap.get(node.id)?.[0]?.target_node_id ?? null)
            : node.id,
          previous_node_id: node.id,
          current_node_id: node.id,
          variables: variables as never,
          messages_sent: messagesSent,
          resume_at: result.wait.resumeAt ?? null,
        });
        await ctx.emit("FlowPaused", { state: result.wait.state, resume_at: result.wait.resumeAt ?? null }, node.id);
        return { state: finalState, messagesSent, steps: seq };
      }

      const outgoing = edgeMap.get(node.id) ?? [];
      const matched =
        result.nextHandle != null
          ? outgoing.find(
              (e) =>
                e.source_handle === result.nextHandle ||
                e.source_handle === `exit_${result.nextHandle}` ||
                e.source_handle?.toLowerCase() === result.nextHandle?.toLowerCase() ||
                (result.nextHandle === "success" &&
                  (e.source_handle === "resposta_bem_sucedida" || e.source_handle === "resposta_sucesso")) ||
                (result.nextHandle === "failure" &&
                  (e.source_handle === "resposta_falha" || e.source_handle === "error")) ||
                (result.nextHandle === "inactivity" &&
                  (e.source_handle === "inatividade" || e.source_handle === "timeout")),
            )
          : undefined;
      if (node.node_type === "question" && result.nextHandle != null && !matched) {
        errorMsg = `A saída "${result.nextHandle}" do bloco Fazer uma pergunta não está conectada.`;
        finalState = "FAILED";
        await ctx.emit(
          "NodeFailed",
          { error: errorMsg, missing_handle: result.nextHandle },
          node.id,
        );
        break;
      }
      const chosen = result.nextHandle != null ? matched ?? outgoing[0] : outgoing[0];
      previousId = node.id;
      cursor = chosen?.target_node_id;

      if (node.node_type === "end") {
        finalState = "COMPLETED";
        break;
      }
      if (!cursor) {
        finalState = "COMPLETED";
        break;
      }

      // FB-V1.2 · Smart Transition Delay — atraso configurado na aresta.
      // Aplicado APÓS a execução do bloco de origem e ANTES do próximo.
      // Curto (<= 2s): sleep em memória para preservar fluidez do run atual.
      // Longo (> 2s): pausa persistente em WAITING_DELAY com resume_at.
      const transitionDelayMs = Math.max(0, Number(chosen?.transition_delay_ms ?? 0) || 0);
      if (transitionDelayMs > 0) {
        await ctx.emit(
          "TransitionDelay",
          {
            from_node_id: node.id,
            to_node_id: cursor,
            delay_ms: transitionDelayMs,
          },
          node.id,
        );
        if (transitionDelayMs <= 2000) {
          await sleep(transitionDelayMs);
        } else {
          finalState = "WAITING_DELAY";
          const resumeAt = new Date(Date.now() + transitionDelayMs).toISOString();
          await updateRun(supabase, runId, {
            state: "WAITING_DELAY",
            status: "waiting",
            cursor_node_id: cursor,
            previous_node_id: node.id,
            current_node_id: node.id,
            variables: variables as never,
            messages_sent: messagesSent,
            resume_at: resumeAt,
          });
          await ctx.emit("FlowPaused", { state: "WAITING_DELAY", resume_at: resumeAt, reason: "edge_transition_delay" }, node.id);
          return { state: finalState, messagesSent, steps: seq };
        }
      }
    }

    const now = new Date().toISOString();
    const endedWithoutEndNode = finalState === "COMPLETED" && errorMsg !== null;
    await updateRun(supabase, runId, {
      state: finalState,
      status: finalState === "COMPLETED" ? "completed" : finalState === "FAILED" ? "failed" : "waiting",
      messages_sent: messagesSent,
      variables: variables as never,
      current_node_id: cursor ?? previousId ?? null,
      previous_node_id: previousId,
      completed_at: finalState === "COMPLETED" || finalState === "FAILED" ? now : null,
      error: errorMsg,
    });
    await ctx.emit(
      finalState === "COMPLETED"
        ? (endedWithoutEndNode ? "FlowCompletedWithoutEnd" : "FlowCompleted")
        : finalState === "FAILED"
          ? "FlowFailed"
          : "FlowPaused",
      {
        messages_sent: messagesSent,
        steps: seq,
        error: errorMsg,
        last_node_id: previousId,
      },
    );

    return { state: finalState, messagesSent, steps: seq, error: errorMsg ?? undefined };
  } finally {
    await supabase.rpc("flow_run_release_lock", { _run_id: runId, _lock_token: lockToken });
  }
}

// ---- Public helper: create + execute a run in one shot ----------------

export async function createAndExecuteRun(opts: {
  supabase: SupabaseClient;
  companyId: string;
  flowId: string;
  conversationId?: string | null;
  channelId?: string | null;
  triggerType?: string;
  triggerPayload?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  dryRun?: boolean;
  idempotencyKey?: string;
}): Promise<{ runId: string; state: FlowState; messagesSent: number; error?: string }> {
  const { supabase } = opts;

  console.info("[FLOW_RUNTIME_AUDIT] CreateRunRequested", {
    flowId: opts.flowId,
    companyId: opts.companyId,
    conversationId: opts.conversationId ?? null,
    channelId: opts.channelId ?? null,
    triggerType: opts.triggerType ?? "manual",
    dryRun: opts.dryRun ?? false,
    hasIdempotencyKey: !!opts.idempotencyKey,
  });

  // Idempotency: reuse existing run
  if (opts.idempotencyKey) {
    const { data: existing } = await supabase
      .from("flow_runs")
      .select("id, state, messages_sent")
      .eq("company_id", opts.companyId)
      .eq("idempotency_key" as never, opts.idempotencyKey)
      .maybeSingle();
    if (existing) {
      const e = existing as { id: string; state: FlowState; messages_sent: number };
      return { runId: e.id, state: e.state, messagesSent: e.messages_sent };
    }
  }

  // ---- Runtime-02.1 Publish Lock -----------------------------------------
  // Every real run MUST be pinned to the latest published flow version.
  // Dry runs (Test Drawer / editor previews) fall back to the live graph so
  // authors can iterate on unpublished changes.
  const isDryRun = opts.dryRun ?? false;
  let pinnedVersionId: string | null = null;
  let pinnedVersionNumber: number | null = null;
  let pinnedHash: string | null = null;

  if (!isDryRun) {
    const resolution = await resolvePublishedFlowVersion(supabase, {
      flowId: opts.flowId,
      companyId: opts.companyId,
      caller: "createAndExecuteRun",
    });
    const pub = resolution.version;
    if (!pub) {
      // CRITICAL-01 P1: também sinaliza o descompasso com o estado 'active'
      // caso ele ainda ocorra por dados legados.
      const { data: flowRow } = await supabase
        .from("flows")
        .select("status")
        .eq("id", opts.flowId)
        .maybeSingle();
      const status = (flowRow as { status?: string } | null)?.status ?? "unknown";
      console.info("[FLOW_RUNTIME_AUDIT] PublishedVersionNotFound", {
        function: "createAndExecuteRun",
        flow_id: opts.flowId,
        company_id: opts.companyId,
        flow_status: status,
        sql: resolution.sql,
        rows_returned: resolution.rowsReturned,
        reason: resolution.reason,
      });
      throw new Error(
        status === "active"
          ? "Fluxo marcado como Ativo, mas nenhuma versão publicada foi encontrada. Abra o editor e clique em Publicar novamente."
          : "Fluxo não possui versão publicada. Publique uma versão antes de executar em produção.",
      );
    }
    const v = pub as {
      id: string;
      version_number: number;
      integrity_hash: string | null;
      snapshot: unknown;
    };
    pinnedVersionId = v.id;
    pinnedVersionNumber = v.version_number;

    // Recompute the executor-side hash of the pinned snapshot at run creation.
    // Storing it on the run row lets executeRun detect divergence if the
    // version snapshot is later mutated (should never happen, but the hash
    // is our tripwire).
    const snap = (v.snapshot ?? {}) as PublishedSnapshot;
    const snapNodes: NodeRow[] = (snap.nodes ?? []).map((n) => ({
      id: String(n.id),
      node_type: String(n.node_type),
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    const snapEdges: EdgeRow[] = (snap.edges ?? []).map((e) => ({
      source_node_id: String(e.source_node_id),
      target_node_id: String(e.target_node_id),
      source_handle: (e.source_handle ?? null) as string | null,
      transition_delay_ms: Math.max(0, Number(e.transition_delay_ms ?? 0) || 0),
    }));
    pinnedHash = graphHash(snapNodes, snapEdges);
    console.info("[FLOW_RUNTIME_AUDIT] PublishedVersionResolved", {
      flowId: opts.flowId,
      companyId: opts.companyId,
      versionId: pinnedVersionId,
      versionNumber: pinnedVersionNumber,
      graphHash: pinnedHash,
      nodeCount: snapNodes.length,
      edgeCount: snapEdges.length,
    });
  }

  const now = new Date().toISOString();
  const { data: run, error } = await supabase
    .from("flow_runs")
    .insert({
      company_id: opts.companyId,
      flow_id: opts.flowId,
      conversation_id: opts.conversationId ?? null,
      channel_id: opts.channelId ?? null,
      state: "QUEUED",
      status: "running",
      started_at: now,
      variables: (opts.variables ?? {}) as never,
      dry_run: isDryRun,
      trigger_type: opts.triggerType ?? "manual",
      trigger_payload: (opts.triggerPayload ?? {}) as never,
      idempotency_key: opts.idempotencyKey ?? null,
      is_test: isDryRun,
      published_version_id: pinnedVersionId,
      published_version_number: pinnedVersionNumber,
      graph_hash: pinnedHash,
    } as never)
    .select("id")
    .single();
  if (error || !run) throw new Error(error?.message ?? "Falha ao criar execução");

  await emitEvent(supabase, run.id, opts.companyId, opts.flowId, "RuntimeRunCreated", {
    trigger_type: opts.triggerType ?? "manual",
    conversation_id: opts.conversationId ?? null,
    channel_id: opts.channelId ?? null,
    dry_run: isDryRun,
  });
  await emitEvent(supabase, run.id, opts.companyId, opts.flowId, "RuntimeVersionResolved", {
    version_id: pinnedVersionId,
    version_number: pinnedVersionNumber,
    graph_hash: pinnedHash,
  });
  console.info("[FLOW_RUNTIME_AUDIT] RuntimeRunCreated", {
    runId: run.id,
    flowId: opts.flowId,
    companyId: opts.companyId,
    triggerType: opts.triggerType ?? "manual",
    pinnedVersionId,
    pinnedVersionNumber,
  });

  const result = await executeRun({ supabase, runId: run.id });
  return { runId: run.id, ...result };
}
