import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Testes de OBS-H-01 — Guardian External Alerter.
 * Foca no que a Fase 1.5B exige validar:
 *  - Habilitação/desabilitação por env.
 *  - Deduplicação por fingerprint (cooldown).
 *  - Rate limit global.
 *  - Filtro por severidade mínima.
 */

const ORIGINAL_ENV = { ...process.env };

async function loadFresh() {
  vi.resetModules();
  return await import("../guardian-alerter.server");
}

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("guardian alerter", () => {
  it("skipped='disabled' quando GUARDIAN_ALERT_ENABLED != true", async () => {
    setEnv({ GUARDIAN_ALERT_ENABLED: "false", GUARDIAN_ALERT_WEBHOOK_URL: "https://x/y" });
    const mod = await loadFresh();
    const r = await mod.sendGuardianAlert({
      incidentId: "i1", companyId: "c1", kind: "network", severity: "critical", message: "x",
    });
    expect(r).toEqual({ sent: false, skipped: "disabled" });
    expect((globalThis.fetch as any).mock.calls.length).toBe(0);
  });

  it("skipped='below_min_severity' quando severidade < mínima", async () => {
    setEnv({
      GUARDIAN_ALERT_ENABLED: "true",
      GUARDIAN_ALERT_WEBHOOK_URL: "https://x/y",
      GUARDIAN_ALERT_MIN_SEVERITY: "critical",
    });
    const mod = await loadFresh();
    const r = await mod.sendGuardianAlert({
      incidentId: "i2", companyId: "c1", kind: "network", severity: "medium", message: "x",
    });
    expect(r.skipped).toBe("below_min_severity");
  });

  it("envia e depois deduplica por fingerprint (cooldown)", async () => {
    setEnv({
      GUARDIAN_ALERT_ENABLED: "true",
      GUARDIAN_ALERT_WEBHOOK_URL: "https://x/y",
      GUARDIAN_ALERT_MIN_SEVERITY: "critical",
      GUARDIAN_ALERT_COOLDOWN_MS: "300000",
      GUARDIAN_ALERT_MAX_PER_MIN: "100",
    });
    const mod = await loadFresh();
    const payload = {
      incidentId: "i3", companyId: "c1", kind: "network",
      severity: "critical" as const, message: "boom", fingerprint: "fp-1",
    };
    const first = await mod.sendGuardianAlert(payload);
    expect(first.sent).toBe(true);
    const second = await mod.sendGuardianAlert(payload);
    expect(second).toEqual({ sent: false, skipped: "fingerprint_cooldown" });
    expect((globalThis.fetch as any).mock.calls.length).toBe(1);
  });

  it("aplica rate limit global", async () => {
    setEnv({
      GUARDIAN_ALERT_ENABLED: "true",
      GUARDIAN_ALERT_WEBHOOK_URL: "https://x/y",
      GUARDIAN_ALERT_MIN_SEVERITY: "critical",
      GUARDIAN_ALERT_COOLDOWN_MS: "0",
      GUARDIAN_ALERT_MAX_PER_MIN: "2",
    });
    const mod = await loadFresh();
    const mk = (n: number) => ({
      incidentId: `i${n}`, companyId: "c1", kind: "network",
      severity: "critical" as const, message: "m", fingerprint: `fp-${n}`,
    });
    const r1 = await mod.sendGuardianAlert(mk(1));
    const r2 = await mod.sendGuardianAlert(mk(2));
    const r3 = await mod.sendGuardianAlert(mk(3));
    expect(r1.sent && r2.sent).toBe(true);
    expect(r3).toEqual({ sent: false, skipped: "global_rate_limit" });
  });

  it("registra erro quando webhook responde 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    setEnv({
      GUARDIAN_ALERT_ENABLED: "true",
      GUARDIAN_ALERT_WEBHOOK_URL: "https://x/y",
      GUARDIAN_ALERT_MIN_SEVERITY: "critical",
    });
    const mod = await loadFresh();
    const r = await mod.sendGuardianAlert({
      incidentId: "i4", companyId: "c1", kind: "network",
      severity: "critical", message: "x", fingerprint: "fp-500",
    });
    expect(r.sent).toBe(false);
    expect(r.error).toContain("HTTP 500");
  });
});
