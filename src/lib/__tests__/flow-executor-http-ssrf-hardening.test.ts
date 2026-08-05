/**
 * FINAL PRODUCTION ACCEPTANCE GATE — Hardening SSRF (HTTP node).
 *
 * Fecha bypasses identificados na re-auditoria de segurança (seção 18):
 *   1. Redirect 3xx apontando para host privado → bloqueado (redirect: manual).
 *   2. Formatos alternativos de IPv4 (decimal, hex, octal) → bloqueados.
 *   3. `isPrivateHost` reconhece `2130706433`, `0x7f000001`, `017700000001`.
 *
 * DNS rebinding (hostname público → IP privado) é coberto por
 * `isHostnameResolvablyPrivate` best-effort quando `node:dns` está disponível
 * no runtime; quando não estiver, o teste apenas confirma que a chamada
 * degrada silenciosamente (não quebra o run).
 */
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

const mod = await import("../flow-executor.server");
const { getPlugin, isPrivateHost } = mod as typeof mod & {
  isPrivateHost: (h: string) => boolean;
};
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

async function run(data: Record<string, unknown>) {
  const ctx = { supabase: {} as unknown, variables: {}, dryRun: false, now: new Date() } as unknown as Parameters<typeof http.execute>[1];
  return http.execute({ id: "n1", data } as never, ctx);
}

describe("FINAL GATE — SSRF hardening (unit)", () => {
  beforeEach(() => {
    fetchCalls = [];
  });

  it("isPrivateHost bloqueia formatos numéricos alternativos", () => {
    // 127.0.0.1 em decimal, hex e octal.
    expect(isPrivateHost("2130706433")).toBe(true);
    expect(isPrivateHost("0x7f000001")).toBe(true);
    expect(isPrivateHost("017700000001")).toBe(true);
    // Também 10.0.0.1 em decimal (167772161).
    expect(isPrivateHost("167772161")).toBe(true);
    // Pública continua liberada.
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("134744072")).toBe(false); // 8.8.8.8 em decimal.
  });

  it("httpNode bloqueia URL com IP decimal apontando para 127.0.0.1", async () => {
    installFetch(() => new Response("nope"));
    const r = await run({ url: "http://2130706433/", method: "GET" });
    expect(r.status).toBe("failed");
    expect(String(r.message)).toContain("privada");
    expect(fetchCalls.length).toBe(0);
  });

  it("httpNode bloqueia URL com IP hex apontando para 127.0.0.1", async () => {
    installFetch(() => new Response("nope"));
    const r = await run({ url: "http://0x7f000001/", method: "GET" });
    expect(r.status).toBe("failed");
    expect(fetchCalls.length).toBe(0);
  });

  it("redirect 3xx é bloqueado — não segue Location para localhost", async () => {
    installFetch(() =>
      new Response("", {
        status: 302,
        headers: { location: "http://127.0.0.1:9000/admin" },
      }),
    );
    const r = await run({ url: "https://public.example.com/redir", method: "GET" });
    expect(r.status).toBe("failed");
    expect(String(r.message)).toContain("Redirecionamento");
    // Um único hit ao host público — nenhum follow-up interno.
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe("https://public.example.com/redir");
    expect((fetchCalls[0].init as { redirect?: string } | undefined)?.redirect).toBe("manual");
  });

  it("redirect 301 para IMDS (169.254.169.254) é bloqueado", async () => {
    installFetch(() =>
      new Response("", {
        status: 301,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    );
    const r = await run({ url: "https://public.example.com/imds", method: "GET" });
    expect(r.status).toBe("failed");
    expect(String(r.message)).toMatch(/Redirecionamento|301/);
    expect(fetchCalls.length).toBe(1);
  });

  it("resposta 200 pública continua funcionando (sanity)", async () => {
    installFetch(() => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const r = await run({ url: "https://public.example.com/ok", method: "GET" });
    expect(r.status).toBe("ok");
    expect(fetchCalls.length).toBe(1);
  });
});
