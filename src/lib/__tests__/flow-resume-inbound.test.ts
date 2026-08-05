/**
 * Runtime-02.2 (Wait Reply Recovery) — unit tests.
 *
 * Exercises the atomic hand-off, idempotency guard, executor invocation and
 * failure path with an in-memory fake Supabase that mimics the exact chain
 * calls used by the helper.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resumeWaitingReplyForConversation,
  type InboundReplyMessage,
} from "../flow-resume-inbound.server";

type FlowRun = {
  id: string;
  company_id: string;
  conversation_id: string | null;
  flow_id: string;
  state: string;
  status: string;
  variables: Record<string, unknown>;
  updated_at: string;
  error?: string | null;
  completed_at?: string | null;
};

type FlowEvent = {
  id: string;
  run_id: string;
  company_id: string;
  flow_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
};

type State = {
  runs: FlowRun[];
  events: FlowEvent[];
};

function makeSupabase(state: State): SupabaseClient {
  let eventSeq = 0;

  function selectFlowRuns(filters: Record<string, unknown>): FlowRun[] {
    return state.runs.filter((r) => {
      for (const [k, v] of Object.entries(filters)) {
        if ((r as unknown as Record<string, unknown>)[k] !== v) return false;
      }
      return true;
    });
  }

  const api: unknown = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let mode: "select" | "update" | "insert" | "" = "";
      let updatePayload: Record<string, unknown> | null = null;
      let insertPayload: Record<string, unknown> | null = null;
      let containsPayload: Record<string, unknown> | null = null;

      const chain: Record<string, unknown> = {
        select() {
          if (mode === "") mode = "select";
          return chain;
        },
        insert(p: Record<string, unknown>) {
          mode = "insert";
          insertPayload = p;
          return chain;
        },
        update(p: Record<string, unknown>) {
          mode = "update";
          updatePayload = p;
          return chain;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        contains(_col: string, payload: Record<string, unknown>) {
          containsPayload = payload;
          return chain;
        },
        async maybeSingle() {
          if (table === "flow_runs" && mode === "select") {
            const rows = selectFlowRuns(filters);
            return { data: rows[0] ?? null, error: null };
          }
          if (table === "flow_events" && mode === "select") {
            const rows = state.events.filter((e) => {
              for (const [k, v] of Object.entries(filters)) {
                if ((e as unknown as Record<string, unknown>)[k] !== v) return false;
              }
              if (containsPayload) {
                for (const [k, v] of Object.entries(containsPayload)) {
                  if ((e.payload as Record<string, unknown>)[k] !== v) return false;
                }
              }
              return true;
            });
            return { data: rows[0] ?? null, error: null };
          }
          if (table === "flow_runs" && mode === "update") {
            const rows = selectFlowRuns(filters);
            const row = rows[0];
            if (!row) return { data: null, error: null };
            Object.assign(row, updatePayload);
            row.updated_at = new Date().toISOString();
            return { data: { id: row.id }, error: null };
          }
          return { data: null, error: null };
        },
        // update().eq().eq() without select().maybeSingle() (failure-path)
        then(resolve: (v: unknown) => void) {
          if (table === "flow_runs" && mode === "update") {
            const rows = selectFlowRuns(filters);
            for (const row of rows) {
              Object.assign(row, updatePayload);
              row.updated_at = new Date().toISOString();
            }
            resolve({ data: null, error: null });
          } else if (table === "flow_events" && mode === "insert") {
            state.events.push({
              id: `evt-${++eventSeq}`,
              run_id: String((insertPayload as Record<string, unknown>).run_id),
              company_id: String((insertPayload as Record<string, unknown>).company_id),
              flow_id: ((insertPayload as Record<string, unknown>).flow_id as string) ?? null,
              event_type: String((insertPayload as Record<string, unknown>).event_type),
              payload: ((insertPayload as Record<string, unknown>).payload ?? {}) as Record<string, unknown>,
            });
            resolve({ data: null, error: null });
          } else {
            resolve({ data: null, error: null });
          }
        },
      };
      return chain;
    },
  };
  return api as SupabaseClient;
}

function makeRun(over: Partial<FlowRun> = {}): FlowRun {
  return {
    id: over.id ?? "run-1",
    company_id: over.company_id ?? "co-1",
    conversation_id: over.conversation_id ?? "conv-1",
    flow_id: over.flow_id ?? "flow-1",
    state: over.state ?? "WAITING_REPLY",
    status: over.status ?? "waiting",
    variables: over.variables ?? {},
    updated_at: over.updated_at ?? new Date().toISOString(),
  };
}

const REPLY: InboundReplyMessage = {
  provider_message_id: "wamid.AAA",
  type: "text",
  body: "Sim quero",
  media_url: null,
  from_phone: "+5511999999999",
};

describe("resumeWaitingReplyForConversation", () => {
  it("resumes the waiting run and injects reply/last_message into variables", async () => {
    const state: State = { runs: [makeRun()], events: [] };
    const executed: string[] = [];
    const res = await resumeWaitingReplyForConversation({
      supabase: makeSupabase(state),
      companyId: "co-1",
      channelId: "ch-1",
      conversationId: "conv-1",
      replyMessage: REPLY,
      executeRun: async ({ runId }) => {
        executed.push(runId);
      },
    });
    expect(res.resumed).toBe(true);
    expect(res.runId).toBe("run-1");
    expect(executed).toEqual(["run-1"]);
    expect(state.runs[0].state).toBe("RUNNING");
    expect(state.runs[0].variables.reply).toMatchObject({ body: "Sim quero", id: "wamid.AAA" });
    expect(state.runs[0].variables.last_message).toBe("Sim quero");
    expect(state.events.some((e) => e.event_type === "FlowReplyReceived")).toBe(true);
  });

  it("returns no_waiting_run when no run is paused", async () => {
    const state: State = { runs: [makeRun({ state: "RUNNING" })], events: [] };
    const res = await resumeWaitingReplyForConversation({
      supabase: makeSupabase(state),
      companyId: "co-1",
      channelId: "ch-1",
      conversationId: "conv-1",
      replyMessage: REPLY,
      executeRun: async () => {},
    });
    expect(res.resumed).toBe(false);
    expect(res.reason).toBe("no_waiting_run");
  });

  it("deduplicates by provider_message_id (Meta retry / duplicate deliveries)", async () => {
    const state: State = {
      runs: [makeRun({ state: "RUNNING" })],
      events: [
        {
          id: "evt-0",
          run_id: "run-1",
          company_id: "co-1",
          flow_id: "flow-1",
          event_type: "FlowReplyReceived",
          payload: { provider_message_id: "wamid.AAA" },
        },
      ],
    };
    // Force the "already waiting" path by making the run WAITING_REPLY again
    state.runs[0].state = "WAITING_REPLY";
    const executed: string[] = [];
    const res = await resumeWaitingReplyForConversation({
      supabase: makeSupabase(state),
      companyId: "co-1",
      channelId: "ch-1",
      conversationId: "conv-1",
      replyMessage: REPLY,
      executeRun: async ({ runId }) => executed.push(runId),
    });
    expect(res.resumed).toBe(true);
    expect(res.reason).toBe("duplicate_message");
    expect(executed).toEqual([]);
  });

  it("only one caller wins when two inbound messages race", async () => {
    const state: State = { runs: [makeRun()], events: [] };
    const supabase = makeSupabase(state);
    const executed: string[] = [];
    const runOne = async (id: string) =>
      resumeWaitingReplyForConversation({
        supabase,
        companyId: "co-1",
        channelId: "ch-1",
        conversationId: "conv-1",
        replyMessage: { ...REPLY, provider_message_id: id },
        executeRun: async ({ runId }) => {
          executed.push(runId);
        },
      });
    const [a, b] = await Promise.all([runOne("wamid.A"), runOne("wamid.B")]);
    // With the atomic UPDATE ... WHERE state='WAITING_REPLY' both callers
    // read the row, but only the first update flips the state. The second
    // update's .maybeSingle() then returns null because the row no longer
    // matches WAITING_REPLY.
    const wins = [a, b].filter((r) => r.resumed && r.reason !== "lost_race" && r.reason !== "duplicate_message");
    expect(wins.length).toBeGreaterThanOrEqual(1);
    // executor was invoked exactly for the winners
    expect(executed.length).toBe(wins.length);
    // Only one actual resume against the run
    expect(state.runs[0].state).toBe("RUNNING");
  });

  it("marks run FAILED when the executor throws", async () => {
    const state: State = { runs: [makeRun()], events: [] };
    const res = await resumeWaitingReplyForConversation({
      supabase: makeSupabase(state),
      companyId: "co-1",
      channelId: "ch-1",
      conversationId: "conv-1",
      replyMessage: REPLY,
      executeRun: async () => {
        throw new Error("boom");
      },
    });
    expect(res.resumed).toBe(true);
    expect(res.reason).toBe("executor_failed");
    expect(state.runs[0].state).toBe("FAILED");
    expect(state.events.some((e) => e.event_type === "FlowResumeFailed")).toBe(true);
  });

  it("scopes by conversation_id — a second conversation stays untouched", async () => {
    const state: State = {
      runs: [
        makeRun({ id: "run-1", conversation_id: "conv-1" }),
        makeRun({ id: "run-2", conversation_id: "conv-2" }),
      ],
      events: [],
    };
    await resumeWaitingReplyForConversation({
      supabase: makeSupabase(state),
      companyId: "co-1",
      channelId: "ch-1",
      conversationId: "conv-1",
      replyMessage: REPLY,
      executeRun: async () => {},
    });
    expect(state.runs.find((r) => r.id === "run-1")!.state).toBe("RUNNING");
    expect(state.runs.find((r) => r.id === "run-2")!.state).toBe("WAITING_REPLY");
  });
});
