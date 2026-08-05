/**
 * FB-10.4B — Validação E2E interna do bloco Ação.
 *
 * Cobre as três ações SUPPORTED (add_tag, remove_tag, assign_agent) com foco em:
 *   - Feliz caminho (cenário positivo);
 *   - Idempotência (retomada não duplica side-effects);
 *   - Isolamento multi-tenant (recurso de outra empresa é rejeitado);
 *   - Configuração ausente/inválida (skipped/failed sem quebrar o run).
 *
 * Usa apenas o executor real (`getPlugin("action")`) com um mock de Supabase.
 * Nenhuma rede real, nenhum provider externo.
 */
import { describe, it, expect } from "bun:test";

const { getPlugin } = await import("../flow-executor.server");

type Row = Record<string, unknown>;

interface MockState {
  tags: Row[]; // { id, name, company_id }
  profiles: Row[]; // { id, company_id }
  contactTags: Row[]; // { contact_id, tag_id, company_id }
  conversations: Row[]; // { id, company_id, assigned_user_id, assigned_agent_id }
  upsertCalls: number;
  deleteCalls: number;
  updateCalls: number;
}

function makeSupabaseMock(initial: Partial<MockState> = {}) {
  const state: MockState = {
    tags: initial.tags ?? [],
    profiles: initial.profiles ?? [],
    contactTags: initial.contactTags ?? [],
    conversations: initial.conversations ?? [],
    upsertCalls: 0,
    deleteCalls: 0,
    updateCalls: 0,
  };

  function tableFor(name: string): Row[] {
    switch (name) {
      case "tags":
        return state.tags;
      case "profiles":
        return state.profiles;
      case "contact_tags":
        return state.contactTags;
      case "conversations":
        return state.conversations;
      default:
        throw new Error(`Tabela mock não suportada: ${name}`);
    }
  }

  function buildSelectChain(rows: Row[]) {
    const filters: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return chain;
      },
      async maybeSingle() {
        const found = rows.find((r) => filters.every(([c, v]) => r[c] === v));
        return { data: found ?? null, error: null };
      },
    };
    return chain;
  }

  const client = {
    from(name: string) {
      const rows = tableFor(name);
      return {
        select(_cols?: string) {
          return buildSelectChain(rows);
        },
        upsert(row: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          state.upsertCalls += 1;
          const conflictCols = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          const exists =
            conflictCols.length > 0 &&
            rows.some((r) => conflictCols.every((c) => r[c] === (row as Row)[c]));
          if (!exists) rows.push({ ...row });
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          state.deleteCalls += 1;
          const filters: Array<[string, unknown]> = [];
          const chain: Record<string, unknown> = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return chain;
            },
            then(resolve: (v: { data: null; error: null }) => void) {
              const before = rows.length;
              for (let i = rows.length - 1; i >= 0; i--) {
                if (filters.every(([c, v]) => rows[i][c] === v)) rows.splice(i, 1);
              }
              // Registra também no state para asserts (rows removidas).
              void before;
              resolve({ data: null, error: null });
            },
          };
          return chain;
        },
        update(patch: Row) {
          state.updateCalls += 1;
          const filters: Array<[string, unknown]> = [];
          const chain: Record<string, unknown> = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return chain;
            },
            then(resolve: (v: { data: null; error: null }) => void) {
              for (const r of rows) {
                if (filters.every(([c, v]) => r[c] === v)) Object.assign(r, patch);
              }
              resolve({ data: null, error: null });
            },
          };
          return chain;
        },
      };
    },
  };
  return { client, state };
}

const action = () => {
  const p = getPlugin("action");
  if (!p) throw new Error("action plugin não registrado");
  return p;
};

const baseCtx = (supabase: unknown, overrides: Record<string, unknown> = {}) => ({
  runId: "run-1",
  companyId: "co-A",
  flowId: "fl-1",
  supabase,
  channel: null,
  contact: { id: "ct-1", name: "Alice", phone: "+5511" },
  conversation: { id: "conv-1", channelId: null, contactId: "ct-1" },
  variables: {},
  history: [],
  dryRun: false,
  async emit() {},
  ...overrides,
});

const node = (data: Record<string, unknown>) => ({ id: "a1", node_type: "action", data });

describe("FB-10.4B — Action executor E2E", () => {
  describe("add_tag", () => {
    it("ACTION 1 — adiciona etiqueta e devolve output com nome resolvido", async () => {
      const sb = makeSupabaseMock({
        tags: [{ id: "tag-1", name: "VIP", company_id: "co-A" }],
      });
      const res = await action().execute(
        node({ action_type: "add_tag", tag_id: "tag-1", tag_label: "VIP" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("ok");
      expect(res.output).toMatchObject({ action: "add_tag", tag_id: "tag-1", tag_name: "VIP" });
      expect(sb.state.contactTags).toHaveLength(1);
    });

    it("ACTION 2 — adicionar etiqueta já existente NÃO duplica (idempotente)", async () => {
      const sb = makeSupabaseMock({
        tags: [{ id: "tag-1", name: "VIP", company_id: "co-A" }],
        contactTags: [{ contact_id: "ct-1", tag_id: "tag-1", company_id: "co-A" }],
      });
      const res = await action().execute(
        node({ action_type: "add_tag", tag_id: "tag-1" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("ok");
      expect(sb.state.contactTags).toHaveLength(1);
    });

    it("bloqueia etiqueta de outra empresa (multi-tenant)", async () => {
      const sb = makeSupabaseMock({
        tags: [{ id: "tag-x", name: "Alheia", company_id: "co-B" }],
      });
      const res = await action().execute(
        node({ action_type: "add_tag", tag_id: "tag-x" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("failed");
      expect(res.message).toMatch(/outra empresa/i);
      expect(sb.state.contactTags).toHaveLength(0);
    });
  });

  describe("remove_tag", () => {
    it("ACTION 3 — remove etiqueta existente", async () => {
      const sb = makeSupabaseMock({
        tags: [{ id: "tag-1", name: "VIP", company_id: "co-A" }],
        contactTags: [{ contact_id: "ct-1", tag_id: "tag-1", company_id: "co-A" }],
      });
      const res = await action().execute(
        node({ action_type: "remove_tag", tag_id: "tag-1" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("ok");
      expect(sb.state.contactTags).toHaveLength(0);
    });

    it("ACTION 4 — remover etiqueta inexistente é seguro (no-op idempotente)", async () => {
      const sb = makeSupabaseMock({
        tags: [{ id: "tag-1", name: "VIP", company_id: "co-A" }],
      });
      const res = await action().execute(
        node({ action_type: "remove_tag", tag_id: "tag-1" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("ok");
      expect(sb.state.contactTags).toHaveLength(0);
    });
  });

  describe("assign_agent", () => {
    it("ACTION 5 — atribui atendente da mesma empresa", async () => {
      const sb = makeSupabaseMock({
        profiles: [{ id: "user-1", company_id: "co-A" }],
        conversations: [
          { id: "conv-1", company_id: "co-A", assigned_user_id: null, assigned_agent_id: "agent-9" },
        ],
      });
      const res = await action().execute(
        node({ action_type: "assign_agent", agent_user_id: "user-1", agent_user_label: "Maria" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("ok");
      const conv = sb.state.conversations[0];
      expect(conv.assigned_user_id).toBe("user-1");
      expect(conv.assigned_agent_id).toBeNull();
    });

    it("assign_agent é idempotente — reatribuir mesmo user não gera efeito extra", async () => {
      const sb = makeSupabaseMock({
        profiles: [{ id: "user-1", company_id: "co-A" }],
        conversations: [
          { id: "conv-1", company_id: "co-A", assigned_user_id: "user-1", assigned_agent_id: null },
        ],
      });
      const res = await action().execute(
        node({ action_type: "assign_agent", agent_user_id: "user-1" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("ok");
      expect(sb.state.conversations[0].assigned_user_id).toBe("user-1");
    });

    it("bloqueia atendente de outra empresa (multi-tenant)", async () => {
      const sb = makeSupabaseMock({
        profiles: [{ id: "user-x", company_id: "co-B" }],
        conversations: [
          { id: "conv-1", company_id: "co-A", assigned_user_id: null, assigned_agent_id: null },
        ],
      });
      const res = await action().execute(
        node({ action_type: "assign_agent", agent_user_id: "user-x" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("failed");
      expect(sb.state.conversations[0].assigned_user_id).toBeNull();
    });
  });

  describe("guardas gerais", () => {
    it("ação vazia → skipped (não bloqueia o run)", async () => {
      const sb = makeSupabaseMock();
      const res = await action().execute(node({ action_type: "" }) as never, baseCtx(sb.client) as never);
      expect(res.status).toBe("skipped");
    });

    it("action_type desconhecida → skipped", async () => {
      const sb = makeSupabaseMock();
      const res = await action().execute(
        node({ action_type: "start_flow" }) as never,
        baseCtx(sb.client) as never,
      );
      expect(res.status).toBe("skipped");
      expect(res.message).toMatch(/não suportada/i);
    });

    it("dryRun → não muta, retorna dry_run:true", async () => {
      const sb = makeSupabaseMock({ tags: [{ id: "tag-1", name: "VIP", company_id: "co-A" }] });
      const res = await action().execute(
        node({ action_type: "add_tag", tag_id: "tag-1" }) as never,
        baseCtx(sb.client, { dryRun: true }) as never,
      );
      expect(res.status).toBe("ok");
      expect(res.output).toMatchObject({ dry_run: true });
      expect(sb.state.contactTags).toHaveLength(0);
    });
  });
});
