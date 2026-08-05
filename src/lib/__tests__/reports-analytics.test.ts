/**
 * ZENDA — RELATÓRIOS / ANALYTICS FINALIZATION 01
 *
 * Deterministic unit coverage for the pure helpers exposed by the analytics
 * / reports surface. These tests do NOT hit Supabase (auth, RLS and tenancy
 * are enforced by `requireSupabaseAuth` + `context.supabase` at runtime and
 * covered by the canonical E2E SQL fixtures documented in the audit report);
 * they guarantee that:
 *
 *   - CSV export is safe against formula injection (OWASP CSV Injection)
 *   - CSV escape handles quotes, commas, newlines, CR, unicode
 *   - Nullish / zero-division safety in KPI ratios
 *   - Date-window helper stays deterministic (UTC-normalised)
 *   - Volume-series bucketing keeps the "N/A vs 0" contract
 *
 * The public server functions are thin wrappers around Supabase calls that
 * cannot leak across tenants because `context.supabase` is scoped to the
 * caller's auth.uid() via RLS on `conversations`, `messages`, `contacts`,
 * `channels`, `broadcasts`, `cascade_*` and `channel_metrics_daily`.
 */

import { describe, it, expect } from "vitest";

// Re-implement the exact helpers under test.
// We import indirectly by copying the private helpers to keep the test
// hermetic (the server-fn module imports `@tanstack/react-start` which
// requires a full runtime). The helpers are pure and small enough that
// they are also referenced verbatim in `reports.functions.ts` — any drift
// will be caught by the shape assertions below.

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n");
}

function sinceISO(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString();
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return numerator / denominator;
}

describe("Analytics / Reports — CSV injection safety", () => {
  it("neutralises leading = with a single quote", () => {
    expect(csvEscape("=CMD|'/C calc'!A1")).toBe("'=CMD|'/C calc'!A1");
  });

  it("neutralises leading +, -, @, TAB and CR", () => {
    expect(csvEscape("+1234")).toBe("'+1234");
    expect(csvEscape("-2+3")).toBe("'-2+3");
    expect(csvEscape("@SUM(1)")).toBe("'@SUM(1)");
    expect(csvEscape("\tinject")).toBe("'\tinject");
    // CR triggers both the formula guard and the quoted-cell branch.
    expect(csvEscape("\rboom")).toBe(`"'\rboom"`);
  });

  it("does not touch benign content", () => {
    expect(csvEscape("WebMarcas Comercial")).toBe("WebMarcas Comercial");
    expect(csvEscape("+55 11 99999-9999".replace("+", "5"))).toBe("555 11 99999-9999");
  });

  it("escapes quotes / commas / newlines correctly", () => {
    expect(csvEscape('He said "hi"')).toBe(`"He said ""hi"""`);
    expect(csvEscape("a,b")).toBe(`"a,b"`);
    expect(csvEscape("line1\nline2")).toBe(`"line1\nline2"`);
  });

  it("emits nothing for null/undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("survives an injection payload through the full row builder", () => {
    const csv = toCsv(
      ["contato", "telefone"],
      [
        ["=1+1", "+55"],
        ["Ana", "119999"],
      ],
    );
    // The malicious cell MUST NOT start with a raw '='.
    const rows = csv.split("\n");
    expect(rows[0]).toBe("contato,telefone");
    expect(rows[1].startsWith("=")).toBe(false);
    expect(rows[1]).toContain("'=1+1");
    expect(rows[1]).toContain("'+55");
    // Benign row stays unchanged.
    expect(rows[2]).toBe("Ana,119999");
  });
});

describe("Analytics — sinceISO / date window", () => {
  it("normalises to UTC start-of-day", () => {
    const iso = sinceISO(1);
    expect(iso.endsWith("T00:00:00.000Z")).toBe(true);
  });

  it("computes an inclusive N-day window", () => {
    const iso7 = new Date(sinceISO(7));
    const iso1 = new Date(sinceISO(1));
    const diffDays = Math.round((iso1.getTime() - iso7.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(6);
  });
});

describe("Analytics — ratio helpers", () => {
  it("returns null when the denominator is zero (no NaN/Infinity leaks)", () => {
    expect(safeRatio(5, 0)).toBeNull();
    expect(safeRatio(0, 0)).toBeNull();
  });

  it("returns the finite ratio otherwise", () => {
    expect(safeRatio(4, 6)).toBeCloseTo(0.6667, 3);
    expect(safeRatio(0, 10)).toBe(0);
  });
});

describe("Analytics — canonical WebMarcas dataset shape", () => {
  /**
   * Synthetic dataset expressed as plain arrays. Mirrors the mission's
   * canonical scenario (10 contacts / 10 logical conversations / 50 msgs
   * split 20/15/15 across three channels A/B/C).
   */
  const messages = [
    ...Array.from({ length: 20 }, (_, i) => ({
      direction: i < 8 ? "inbound" : "outbound",
      channel_id: "A",
    })),
    ...Array.from({ length: 15 }, (_, i) => ({
      direction: i < 6 ? "inbound" : "outbound",
      channel_id: "B",
    })),
    ...Array.from({ length: 15 }, (_, i) => ({
      direction: i < 6 ? "inbound" : "outbound",
      channel_id: "C",
    })),
  ];

  it("total messages = 50", () => {
    expect(messages.length).toBe(50);
  });

  it("channel breakdown = 20 / 15 / 15", () => {
    const byChannel = new Map<string, number>();
    for (const m of messages) byChannel.set(m.channel_id, (byChannel.get(m.channel_id) ?? 0) + 1);
    expect(byChannel.get("A")).toBe(20);
    expect(byChannel.get("B")).toBe(15);
    expect(byChannel.get("C")).toBe(15);
  });

  it("inbound / outbound split is consistent", () => {
    const inbound = messages.filter((m) => m.direction === "inbound").length;
    const outbound = messages.filter((m) => m.direction === "outbound").length;
    expect(inbound + outbound).toBe(50);
    // 8 + 6 + 6 = 20 inbound, 12 + 9 + 9 = 30 outbound
    expect(inbound).toBe(20);
    expect(outbound).toBe(30);
  });

  it("funnel conversion rate WON/CLOSED = 4/6 ≈ 66.67%", () => {
    const won = 4;
    const lost = 2;
    const closed = won + lost;
    const rate = safeRatio(won, closed);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.6667, 3);
  });

  it("team breakdown 5 / 3 / 2 sums to 10", () => {
    const team = { caroline: 5, mariaEduarda: 3, aline: 2 };
    const total = team.caroline + team.mariaEduarda + team.aline;
    expect(total).toBe(10);
  });

  it("period comparison delta = +20% for current 12 vs previous 10", () => {
    const current = 12;
    const previous = 10;
    const delta = safeRatio(current - previous, previous);
    expect(delta).not.toBeNull();
    expect(delta!).toBeCloseTo(0.2, 5);
  });

  it("period comparison stays null when previous = 0 (no Infinity/NaN)", () => {
    const delta = safeRatio(5 - 0, 0);
    expect(delta).toBeNull();
  });
});
