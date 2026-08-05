/**
 * ZENDA — EXECUTOR FINAL AUDIT 01
 *
 * Regressão dedicada ao bug reportado pelo proprietário:
 * "fluxo totalmente linear (sem Aguardar, Delay, resposta do usuário)
 * executa apenas os primeiros nós e depois para".
 *
 * Este teste reproduz exatamente o loop de traversal do `executeRun`
 * chamando os plugins reais registrados em `NODE_PLUGINS`, sem tocar
 * na camada de banco/lock/emit. Se qualquer nó "engolir" a transição
 * (retornar wait sem motivo, cursor virar undefined antes do fim, ou
 * plugin lançar exceção não tratada), o teste falha.
 *
 * Tamanhos exercitados: 10 · 20 · 50 · 100 nós — matching o gate
 * "STRESS TEST" da missão.
 */
import { describe, it, expect, mock } from "bun:test";

// Mock provider — nenhum dispatch real.
const dispatchSendMock = mock(async () => ({
  ok: true as const,
  provider: "whatsapp_cloud",
  provider_message_id: "wamid.AUDIT",
  http_status: 200,
  request: {},
  response: {},
}));
mock.module("@/lib/wa-providers/index.server", () => ({
  dispatchSend: dispatchSendMock,
}));

const { getPlugin, executeRun } = await import("../flow-executor.server");

type NodeRow = { id: string; node_type: string; data: Record<string, unknown> };
type EdgeRow = { source_node_id: string; target_node_id: string; source_handle: string | null };
type FlowRunState = {
  id: string;
  company_id: string;
  flow_id: string;
  conversation_id: string | null;
  channel_id: string | null;
  state: string;
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
  published_version_id: string | null;
  published_version_number: number | null;
  graph_hash: string | null;
  error?: string | null;
};

// ---- Supabase mock mínimo (apenas insert/update em `messages` e
// `contact_tags`; nada mais é tocado nesse cenário linear). ---------
function makeSupabaseMock() {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({ data: { id: `row-${inserts.length}` }, error: null }),
            }),
          };
        },
        update() {
          return { eq: async () => ({ data: null, error: null }) };
        },
        upsert() {
          return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  // devolve tag / profile plausível para qualquer lookup
                  data: { id: "seed", company_id: "co-1", name: "seed" },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
  return { client, inserts };
}

const baseCtx = () => ({
  runId: "run-audit",
  companyId: "co-1",
  flowId: "flow-audit",
  supabase: makeSupabaseMock().client,
  channel: {
    id: "ch-1",
    provider_type: "whatsapp_cloud",
    credentials: {},
    phone_number: "+5511",
  },
  contact: { id: "ct-1", phone: "5511999999999", name: "Audit" },
  conversation: { id: "conv-1", channelId: "ch-1", contactId: "ct-1" },
  variables: {} as Record<string, unknown>,
  history: [],
  dryRun: false,
  emit: async () => {},
});

/**
 * Executa exatamente o mesmo loop de `executeRun` (linhas 2145-2298 do
 * flow-executor.server), sem os side-effects de persistência.
 */
async function driveLinear(
  nodes: NodeRow[],
  edges: EdgeRow[],
  ctx: ReturnType<typeof baseCtx>,
): Promise<{ visited: string[]; finalState: string; error?: string }> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map<string, EdgeRow[]>();
  for (const e of edges) {
    const arr = edgeMap.get(e.source_node_id) ?? [];
    arr.push(e);
    edgeMap.set(e.source_node_id, arr);
  }
  const start = nodes.find((n) => n.node_type === "start")!;
  let cursor: string | undefined = start.id;
  let finalState = "RUNNING";
  let error: string | undefined;
  const visited: string[] = [];
  const guard = new Set<string>();

  while (cursor && visited.length < nodes.length + 5) {
    const node = nodeMap.get(cursor);
    if (!node) {
      error = `cursor inválido ${cursor}`;
      finalState = "FAILED";
      break;
    }
    if (guard.has(cursor)) {
      error = `loop em ${cursor}`;
      finalState = "FAILED";
      break;
    }
    guard.add(cursor);
    visited.push(cursor);

    const plugin = getPlugin(node.node_type);
    if (!plugin) {
      // igual ao executeRun: pula silenciosamente e avança por outgoing[0]
      cursor = edgeMap.get(node.id)?.[0]?.target_node_id;
      continue;
    }
    const result = await plugin.execute(node as never, ctx as never);
    if (result.wait) {
      finalState = result.wait.state;
      error = `pausou inesperadamente em ${node.node_type}`;
      break;
    }
    if (result.status === "failed") {
      finalState = "FAILED";
      error = result.message ?? `falha em ${node.node_type}`;
      break;
    }
    if (node.node_type === "end") {
      finalState = "COMPLETED";
      break;
    }
    const outgoing = edgeMap.get(node.id) ?? [];
    const chosen =
      result.nextHandle != null
        ? outgoing.find((e) => e.source_handle === result.nextHandle) ?? outgoing[0]
        : outgoing[0];
    cursor = chosen?.target_node_id;
    if (!cursor) {
      finalState = "COMPLETED";
      break;
    }
  }
  return { visited, finalState, error };
}

// ---- Fábrica de fluxo linear -----------------------------------------
// Sequência tipada exatamente como o proprietário descreveu.
const LINEAR_CYCLE: string[] = [
  "message",
  "send_audio",
  "send_document",
  "send_image",
  "send_video",
  "tag",
  "message",
];

function buildLinearFlow(nodeCount: number): { nodes: NodeRow[]; edges: EdgeRow[] } {
  const nodes: NodeRow[] = [{ id: "n-start", node_type: "start", data: {} }];
  const edges: EdgeRow[] = [];
  let prev = "n-start";
  for (let i = 0; i < nodeCount; i++) {
    const kind = LINEAR_CYCLE[i % LINEAR_CYCLE.length];
    const id = `n-${i}`;
    const data: Record<string, unknown> = { label: `${kind} ${i}` };
    if (kind === "message") data.body = `msg ${i}`;
    if (kind === "send_image") data.media_url = "https://x/y.png";
    if (kind === "send_audio") data.media_url = "https://x/y.ogg";
    if (kind === "send_video") data.media_url = "https://x/y.mp4";
    if (kind === "send_document") data.media_url = "https://x/y.pdf";
    if (kind === "tag") data.tag_id = "tag-1";
    nodes.push({ id, node_type: kind, data });
    edges.push({ source_node_id: prev, target_node_id: id, source_handle: "default" });
    prev = id;
  }
  nodes.push({ id: "n-end", node_type: "end", data: {} });
  edges.push({ source_node_id: prev, target_node_id: "n-end", source_handle: "default" });
  return { nodes, edges };
}

function makeExecuteRunSupabase(input: {
  run: FlowRunState;
  nodes: NodeRow[];
  edges: EdgeRow[];
}) {
  const state = {
    run: input.run,
    nodes: input.nodes,
    edges: input.edges,
    events: [] as Array<Record<string, unknown>>,
    steps: [] as Array<Record<string, unknown>>,
    deadLetters: [] as Array<Record<string, unknown>>,
  };

  const filterRows = <T extends Record<string, unknown>>(rows: T[], filters: Record<string, unknown>) =>
    rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));

  const client = {
    async rpc(name: string) {
      if (name === "flow_run_acquire_lock") {
        return { data: { acquired: true, lock_token: "audit-lock" }, error: null };
      }
      if (name === "flow_run_release_lock") return { data: null, error: null };
      return { data: null, error: null };
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let mode: "select" | "insert" | "update" | "" = "";
      let payload: Record<string, unknown> | null = null;

      const resolve = () => {
        if (table === "flow_nodes" && mode === "select") return { data: state.nodes, error: null };
        if (table === "flow_edges" && mode === "select") return { data: state.edges, error: null };
        if (table === "flow_runs" && mode === "update") {
          Object.assign(state.run, payload);
          return { data: null, error: null };
        }
        if (table === "flow_events" && mode === "insert" && payload) {
          state.events.push(payload);
          return { data: null, error: null };
        }
        if (table === "flow_run_steps" && mode === "insert" && payload) {
          state.steps.push(payload);
          return { data: null, error: null };
        }
        if (table === "flow_dead_letter" && mode === "insert" && payload) {
          state.deadLetters.push(payload);
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };

      const chain: Record<string, unknown> = {
        select() {
          mode = "select";
          return chain;
        },
        insert(row: Record<string, unknown>) {
          mode = "insert";
          payload = row;
          return chain;
        },
        update(row: Record<string, unknown>) {
          mode = "update";
          payload = row;
          return chain;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return chain;
        },
        async maybeSingle() {
          if (table === "flow_runs" && mode === "select") {
            return { data: state.run.id === filters.id ? state.run : null, error: null };
          }
          if (table === "conversations" && mode === "select") {
            return {
              data: {
                channel_id: "ch-1",
                contact_id: "ct-1",
                channel: {
                  id: "ch-1",
                  provider_type: "whatsapp_cloud",
                  credentials: {},
                  phone_number: "+5511",
                },
                contact: { id: "ct-1", name: "Audit", phone: "5511999999999" },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        async single() {
          return { data: { id: "row-audit" }, error: null };
        },
        then(resolveFn: (value: unknown) => void) {
          resolveFn(resolve());
        },
      };
      return chain;
    },
  };

  return { client, state };
}

describe("ZENDA-EXECUTOR-ROOT-CAUSE-AUDIT-01 · linear traversal", () => {
  for (const size of [10, 20, 50, 100]) {
    it(`executa TODOS os ${size} nós lineares até o "end"`, async () => {
      const flow = buildLinearFlow(size);
      const ctx = baseCtx();
      const out = await driveLinear(flow.nodes, flow.edges, ctx);
      // start + N + end
      const expectedCount = size + 2;
      if (out.finalState !== "COMPLETED") {
        // Diagnóstico rico para a análise de causa raiz.
        // eslint-disable-next-line no-console
        console.error(
          `[AUDIT] parou em index=${out.visited.length - 1} node=${out.visited.at(-1)} err=${out.error}`,
        );
      }
      expect(out.error).toBeUndefined();
      expect(out.finalState).toBe("COMPLETED");
      expect(out.visited.length).toBe(expectedCount);
      expect(out.visited[0]).toBe("n-start");
    });
  }

  it("cenário exato do proprietário (message→message→audio→document→image→video→tag→message→message→end)", async () => {
    const nodes: NodeRow[] = [
      { id: "s", node_type: "start", data: {} },
      { id: "1", node_type: "message", data: { body: "oi" } },
      { id: "2", node_type: "message", data: { body: "tudo bem?" } },
      { id: "3", node_type: "send_audio", data: { media_url: "u://a" } },
      { id: "4", node_type: "send_document", data: { media_url: "u://d" } },
      { id: "5", node_type: "send_image", data: { media_url: "u://i" } },
      { id: "6", node_type: "send_video", data: { media_url: "u://v" } },
      { id: "7", node_type: "tag", data: { tag_id: "t1" } },
      { id: "8", node_type: "message", data: { body: "obrigado" } },
      { id: "9", node_type: "message", data: { body: "até logo" } },
      { id: "e", node_type: "end", data: {} },
    ];
    const seq = ["s", "1", "2", "3", "4", "5", "6", "7", "8", "9", "e"];
    const edges: EdgeRow[] = seq.slice(0, -1).map((src, i) => ({
      source_node_id: src,
      target_node_id: seq[i + 1],
      source_handle: "default",
    }));
    const out = await driveLinear(nodes, edges, baseCtx());
    expect(out.error).toBeUndefined();
    expect(out.finalState).toBe("COMPLETED");
    expect(out.visited).toEqual(seq);
  });

  it("executeRun não converte status failed em sucesso pela primeira edge", async () => {
    const nodes: NodeRow[] = [
      { id: "s", node_type: "start", data: {} },
      { id: "t", node_type: "transfer_number", data: {} },
      { id: "e", node_type: "end", data: {} },
    ];
    const edges: EdgeRow[] = [
      { source_node_id: "s", target_node_id: "t", source_handle: "default" },
      { source_node_id: "t", target_node_id: "e", source_handle: "success" },
    ];
    const { client, state } = makeExecuteRunSupabase({
      nodes,
      edges,
      run: {
        id: "run-failed-status",
        company_id: "co-1",
        flow_id: "flow-audit",
        conversation_id: "conv-1",
        channel_id: "ch-1",
        state: "QUEUED",
        status: "running",
        current_node_id: null,
        cursor_node_id: null,
        previous_node_id: null,
        execution_stack: [],
        context_data: {},
        variables: {},
        retry_count: 0,
        messages_sent: 0,
        dry_run: false,
        metrics: {},
        published_version_id: null,
        published_version_number: null,
        graph_hash: null,
      },
    });

    const result = await executeRun({ supabase: client as never, runId: "run-failed-status" });

    expect(result.state).toBe("FAILED");
    expect(result.error).toBe("Canal de destino não configurado");
    expect(state.run.status).toBe("failed");
    expect(state.steps.map((step) => step.node_type)).toEqual(["start", "transfer_number"]);
    expect(state.events.some((event) => event.event_type === "FlowCompleted")).toBe(false);
    expect(state.events.some((event) => event.event_type === "FlowFailed")).toBe(true);
    expect(state.deadLetters).toHaveLength(1);
  });

  it("executeRun pausa no question e só continua após receber a resposta", async () => {
    const nodes: NodeRow[] = [
      { id: "s", node_type: "start", data: {} },
      {
        id: "q",
        node_type: "question",
        data: {
          body: "Qual é o seu CNPJ?",
          save_as: "cnpj",
          timeout_value: 1,
          timeout_unit: "hours",
        },
      },
      { id: "answered", node_type: "end", data: {} },
      { id: "expired", node_type: "end", data: {} },
    ];
    const edges: EdgeRow[] = [
      { source_node_id: "s", target_node_id: "q", source_handle: "default" },
      { source_node_id: "q", target_node_id: "answered", source_handle: "default" },
      { source_node_id: "q", target_node_id: "expired", source_handle: "no_reply" },
    ];
    const { client, state } = makeExecuteRunSupabase({
      nodes,
      edges,
      run: {
        id: "run-question",
        company_id: "co-1",
        flow_id: "flow-audit",
        conversation_id: "conv-1",
        channel_id: "ch-1",
        state: "QUEUED",
        status: "running",
        current_node_id: null,
        cursor_node_id: null,
        previous_node_id: null,
        execution_stack: [],
        context_data: {},
        variables: {},
        retry_count: 0,
        messages_sent: 0,
        dry_run: false,
        metrics: {},
        published_version_id: null,
        published_version_number: null,
        graph_hash: null,
      },
    });

    const paused = await executeRun({ supabase: client as never, runId: "run-question" });

    expect(paused.state).toBe("WAITING_REPLY");
    expect(state.run.state).toBe("WAITING_REPLY");
    expect(state.run.cursor_node_id).toBe("q");
    expect(state.run.variables.__question).toMatchObject({ nodeId: "q" });
    expect(state.steps.map((step) => step.node_type)).toEqual(["start", "question"]);
    expect(state.events.some((event) => event.event_type === "FlowPaused")).toBe(true);

    state.run.state = "RUNNING";
    state.run.variables = {
      ...state.run.variables,
      reply: { body: "12.345.678/0001-90" },
    };
    const resumed = await executeRun({ supabase: client as never, runId: "run-question" });

    expect(resumed.state).toBe("COMPLETED");
    expect(state.run.variables.cnpj).toBe("12.345.678/0001-90");
    expect(state.run.variables.last_reply).toBe("12.345.678/0001-90");
    expect(state.steps.map((step) => step.node_type)).toEqual([
      "start",
      "question",
      "question",
      "end",
    ]);
    expect(state.steps.some((step) => step.node_id === "expired")).toBe(false);
  });
});
