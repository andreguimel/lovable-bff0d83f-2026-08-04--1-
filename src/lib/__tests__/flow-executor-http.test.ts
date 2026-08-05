/**
 * FB-10.5 — HTTP executor (segurança + interpolação).
 *
 * Cobre:
 *   - SSRF guard: bloqueia localhost / 127.x / 10.x / 192.168.x / 169.254.x / 172.16-31.x;
 *   - Esquema restrito (http/https);
 *   - Interpolação {{...}} em URL, headers, body, bearer token;
 *   - Timeout via AbortController;
 *   - Persistência do resultado em ctx.variables[save_as];
 *   - dryRun não faz requisição real.
 *
 * Mocka global.fetch — não bate rede real.
 */
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

const { getPlugin } = await import("../flow-executor.server");
const http = getPlugin("http_request")!;

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];

function installFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  fetchCalls = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    fetchCalls.push({ url, init });
    return await handler(url, init);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Vars = Record<string, unknown>;
async function run(data: Record<string, unknown>, variables: Vars = {}, dryRun = false) {
  const ctx = { supabase: {} as unknown, variables, dryRun, now: new Date() } as unknown as Parameters<typeof http.execute>[1];
  return http.execute({ id: "n1", data } as never, ctx);
}

describe("FB-10.5 — HTTP executor (SSRF + interpolação)", () => {
  beforeEach(() => {
    fetchCalls = [];
  });

  it("bloqueia localhost (SSRF guard)", async () => {
    installFetch(() => new Response("nope"));
    const r = await run({ url: "http://localhost:9000/x", method: "GET" });
    expect(r.status).toBe("failed");
    expect(String(r.message)).toContain("privada");
    expect(fetchCalls.length).toBe(0);
  });

  it("bloqueia 169.254.169.254 (metadata IMDS)", async () => {
    installFetch(() => new Response("nope"));
    const r = await run({ url: "http://169.254.169.254/latest/meta-data/", method: "GET" });
    expect(r.status).toBe("failed");
    expect(fetchCalls.length).toBe(0);
  });

  it("bloqueia 10.0.0.1 e 192.168.1.1 e 172.16.0.5", async () => {
    installFetch(() => new Response("nope"));
    for (const url of ["http://10.0.0.1/", "http://192.168.1.1/", "http://172.16.0.5/"]) {
      const r = await run({ url, method: "GET" });
      expect(r.status).toBe("failed");
    }
    expect(fetchCalls.length).toBe(0);
  });

  it("bloqueia esquemas não-http", async () => {
    installFetch(() => new Response("nope"));
    const r = await run({ url: "file:///etc/passwd", method: "GET" });
    expect(r.status).toBe("failed");
    expect(fetchCalls.length).toBe(0);
  });

  it("faz GET público e persiste resposta em ctx.variables[save_as]", async () => {
    installFetch(() => new Response(JSON.stringify({ hello: "world" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const r = await run({ url: "https://api.example.com/x", method: "GET", save_as: "resp" });
    expect(r.status).toBe("ok");
    const vars = (r.vars ?? {}) as Record<string, { status: number; body: unknown; ok: boolean }>;
    expect(vars.resp.status).toBe(200);
    expect(vars.resp.ok).toBe(true);
    expect((vars.resp.body as { hello: string }).hello).toBe("world");
  });

  it("interpola {{...}} em URL, headers, body e bearer", async () => {
    installFetch(() => new Response("{}", { status: 200 }));
    await run(
      {
        url: "https://api.example.com/{{contact.id}}",
        method: "POST",
        headers: "X-Trace: {{trace}}\nX-Static: fixo",
        auth_type: "bearer",
        auth_token: "{{secret}}",
        body: '{"name":"{{contact.name}}"}',
      },
      { contact: { id: "abc", name: "Ana" }, trace: "T1", secret: "TOKEN" },
    );
    expect(fetchCalls.length).toBe(1);
    const call = fetchCalls[0];
    expect(call.url).toBe("https://api.example.com/abc");
    const h = call.init!.headers as Record<string, string>;
    expect(h["X-Trace"]).toBe("T1");
    expect(h["X-Static"]).toBe("fixo");
    expect(h["Authorization"]).toBe("Bearer TOKEN");
    expect(h["Content-Type"]).toBe("application/json");
    expect(call.init!.body).toBe('{"name":"Ana"}');
    expect(call.init!.method).toBe("POST");
  });

  it("resposta não-ok → status failed mas ainda persiste body", async () => {
    installFetch(() => new Response("boom", { status: 500 }));
    const r = await run({ url: "https://api.example.com/x", method: "GET" });
    expect(r.status).toBe("failed");
    const vars = (r.vars ?? {}) as Record<string, { status: number; ok: boolean; body: unknown }>;
    expect(vars.http.status).toBe(500);
    expect(vars.http.ok).toBe(false);
    expect(vars.http.body).toBe("boom");
  });

  it("timeout → AbortError vira failed sem estourar", async () => {
    installFetch(async (_url, init) => {
      // Simula um fetch que respeita o AbortSignal.
      return await new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal;
        if (sig) {
          sig.addEventListener("abort", () => {
            const err = new Error("aborted");
            (err as unknown as { name: string }).name = "AbortError";
            reject(err);
          });
        }
      });
    });
    const r = await run({ url: "https://api.example.com/slow", method: "GET", timeout_ms: 50 });
    expect(r.status).toBe("failed");
    expect(String(r.message)).toContain("Timeout");
  });

  it("dryRun não chama fetch e devolve variável dry_run:true", async () => {
    installFetch(() => new Response("no"));
    const r = await run({ url: "https://api.example.com/x", method: "GET", save_as: "resp" }, {}, true);
    expect(r.status).toBe("ok");
    expect(fetchCalls.length).toBe(0);
    const vars = (r.vars ?? {}) as Record<string, { dry_run: boolean }>;
    expect(vars.resp.dry_run).toBe(true);
  });

  it("URL vazia → skipped", async () => {
    installFetch(() => new Response("no"));
    const r = await run({ url: "" });
    expect(r.status).toBe("skipped");
    expect(fetchCalls.length).toBe(0);
  });
});
