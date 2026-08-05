/**
 * FB-10.5 — Condition executor (avaliação estruturada).
 *
 * Cobre:
 *   - Path dotted em ctx.variables (contact.name, http.status, ai.output);
 *   - Operadores: equals, not_equals, contains, gt/gte/lt/lte, exists/not_exists;
 *   - Interpolação {{...}} no valor de comparação;
 *   - Roteamento por handle "true" / "false";
 *   - Fallback legado (expression).
 *
 * Puro CPU — nenhum Supabase, nenhum provider.
 */
import { describe, it, expect } from "bun:test";

const { getPlugin } = await import("../flow-executor.server");

const cond = getPlugin("condition")!;

type Vars = Record<string, unknown>;
async function run(data: Record<string, unknown>, variables: Vars) {
  const ctx = {
    supabase: {} as unknown,
    variables,
    dryRun: false,
    now: new Date(),
  } as unknown as Parameters<typeof cond.execute>[1];
  return cond.execute({ id: "n1", data } as never, ctx);
}

describe("FB-10.5 — Condition executor (structured)", () => {
  it("equals verdadeiro roteia por 'true'", async () => {
    const r = await run(
      { field: "contact.name", operator: "equals", value: "Ana" },
      { contact: { name: "Ana" } },
    );
    expect(r.status).toBe("ok");
    expect(r.nextHandle).toBe("true");
  });

  it("equals falso roteia por 'false'", async () => {
    const r = await run(
      { field: "contact.name", operator: "equals", value: "Bob" },
      { contact: { name: "Ana" } },
    );
    expect(r.nextHandle).toBe("false");
  });

  it("contains funciona em string (case-insensitive)", async () => {
    const r = await run(
      { field: "last_message", operator: "contains", value: "PIX" },
      { last_message: "quero pagar via pix hoje" },
    );
    expect(r.nextHandle).toBe("true");
  });

  it("contains funciona em array (tags)", async () => {
    const r = await run(
      { field: "contact.tags", operator: "contains", value: "VIP" },
      { contact: { tags: ["comum", "VIP"] } },
    );
    expect(r.nextHandle).toBe("true");
  });

  it("gt compara numericamente", async () => {
    const rTrue = await run(
      { field: "http.status", operator: "gte", value: "200" },
      { http: { status: 201 } },
    );
    expect(rTrue.nextHandle).toBe("true");
    const rFalse = await run(
      { field: "http.status", operator: "gt", value: "500" },
      { http: { status: 200 } },
    );
    expect(rFalse.nextHandle).toBe("false");
  });

  it("exists / not_exists cobrem null/undefined/empty", async () => {
    const rHas = await run({ field: "ai.output", operator: "exists" }, { ai: { output: "oi" } });
    expect(rHas.nextHandle).toBe("true");
    const rEmpty = await run({ field: "ai.output", operator: "exists" }, { ai: { output: "" } });
    expect(rEmpty.nextHandle).toBe("false");
    const rMissing = await run({ field: "nope", operator: "not_exists" }, {});
    expect(rMissing.nextHandle).toBe("true");
  });

  it("interpola {{...}} no valor de comparação", async () => {
    const r = await run(
      { field: "contact.name", operator: "equals", value: "{{expected}}" },
      { contact: { name: "Ana" }, expected: "Ana" },
    );
    expect(r.nextHandle).toBe("true");
  });

  it("path inexistente é undefined → equals falha", async () => {
    const r = await run(
      { field: "contact.unknown.deep", operator: "equals", value: "x" },
      { contact: { name: "Ana" } },
    );
    expect(r.nextHandle).toBe("false");
  });

  it("modo legado (expression) continua funcionando (VIP heurístico)", async () => {
    const r = await run({ expression: "contact é VIP" }, {});
    expect(r.nextHandle).toBe("true");
    const r2 = await run({ expression: "algo genérico" }, {});
    expect(r2.nextHandle).toBe("false");
  });
});
