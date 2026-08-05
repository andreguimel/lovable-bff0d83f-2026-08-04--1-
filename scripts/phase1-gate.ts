#!/usr/bin/env bun
/**
 * Phase 1 Gate — Dashboard Premium RC1.
 *
 * Executa auditoria ONE-SHOT do escopo da Fase 1 (Dashboard).
 * - Não implementa funcionalidades novas.
 * - Não corrige nada automaticamente.
 * - Registra status por dimensão e sai com código 0 se aprovado.
 *
 * Ver docs/audits/phase1-gate.md para o relatório humano.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

type Status = "pass" | "warn" | "fail";
type Check = {
  dim: string;
  name: string;
  blocking: boolean;
  run: () => { status: Status; note?: string };
};

const cmd = (c: string) => {
  try {
    execSync(c, { stdio: "pipe" });
    return { status: "pass" as Status };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const out = (err.stdout?.toString() ?? "") + (err.stderr?.toString() ?? "");
    return { status: "fail" as Status, note: (out || err.message || "").slice(-400) };
  }
};

const fileExists = (p: string) => ({
  status: (existsSync(p) ? "pass" : "fail") as Status,
  note: existsSync(p) ? undefined : `ausente: ${p}`,
});

const DASH = "src/components/dashboard";

const shellFiles = [
  "shell/dashboard-shell.tsx",
  "shell/dashboard-header.tsx",
  "shell/widget-frame.tsx",
  "shell/widget-error.tsx",
  "shell/widget-empty.tsx",
  "shell/widget-skeleton.tsx",
];
const widgetFiles = [
  "widgets/kpi-row.tsx",
  "widgets/inbox-live.tsx",
  "widgets/activity-timeline.tsx",
  "widgets/guardian-health.tsx",
  "widgets/ai-summary.tsx",
];
const uxFiles = ["commands/command-palette.tsx", "commands/quick-actions.tsx"];
const rtFiles = ["hooks/use-widget-realtime.ts", "../../lib/realtime/registry.ts"];
const regFiles = ["../../lib/dashboard/widget-registry.ts"];

const checks: Check[] = [
  // 1. Funcional — presença
  ...shellFiles.map((f) => ({
    dim: "1-funcional",
    name: `shell/${f.split("/").pop()}`,
    blocking: true,
    run: () => fileExists(`${DASH}/${f}`),
  })),
  ...widgetFiles.map((f) => ({
    dim: "1-funcional",
    name: `widget/${f.split("/").pop()}`,
    blocking: true,
    run: () => fileExists(`${DASH}/${f}`),
  })),
  ...uxFiles.map((f) => ({
    dim: "1-funcional",
    name: `ux/${f.split("/").pop()}`,
    blocking: true,
    run: () => fileExists(`${DASH}/${f}`),
  })),
  ...rtFiles.map((f) => ({
    dim: "4-realtime",
    name: `realtime/${f.split("/").pop()}`,
    blocking: true,
    run: () => fileExists(`${DASH}/${f}`),
  })),
  ...regFiles.map((f) => ({
    dim: "5-registry",
    name: `registry/${f.split("/").pop()}`,
    blocking: true,
    run: () => fileExists(`${DASH}/${f}`),
  })),
  // 2. Scroll — regra estática: DashboardShell overflow-hidden + DashboardScroll overflow-y-auto
  {
    dim: "2-scroll",
    name: "DashboardShell overflow-hidden",
    blocking: true,
    run: () => {
      const p = `${DASH}/shell/dashboard-shell.tsx`;
      if (!existsSync(p)) return { status: "fail", note: "shell ausente" };
      const src = readFileSync(p, "utf8");
      return {
        status: /overflow-hidden/.test(src) ? "pass" : "fail",
        note: /overflow-hidden/.test(src) ? undefined : "sem overflow-hidden no shell",
      };
    },
  },
  {
    dim: "2-scroll",
    name: "DashboardScroll overflow-y-auto",
    blocking: true,
    run: () => {
      const p = `${DASH}/shell/dashboard-shell.tsx`;
      const src = existsSync(p) ? readFileSync(p, "utf8") : "";
      return {
        status: /overflow-y-auto|overflow-auto/.test(src) ? "pass" : "fail",
      };
    },
  },
  // 3. Crash isolation — WidgetFrame usa ErrorBoundary
  {
    dim: "3-crash",
    name: "WidgetFrame usa ErrorBoundary",
    blocking: true,
    run: () => {
      const p = `${DASH}/shell/widget-frame.tsx`;
      const src = existsSync(p) ? readFileSync(p, "utf8") : "";
      return {
        status: /ErrorBoundary/i.test(src) ? "pass" : "fail",
      };
    },
  },
  {
    dim: "3-crash",
    name: "WidgetFrame usa Suspense",
    blocking: true,
    run: () => {
      const p = `${DASH}/shell/widget-frame.tsx`;
      const src = existsSync(p) ? readFileSync(p, "utf8") : "";
      return { status: /Suspense/.test(src) ? "pass" : "fail" };
    },
  },
  // 4. Realtime — registry centralizado + cleanup
  {
    dim: "4-realtime",
    name: "realtime registry expõe subscribe/cleanup",
    blocking: true,
    run: () => {
      const p = "src/lib/realtime/registry.ts";
      const src = existsSync(p) ? readFileSync(p, "utf8") : "";
      const ok = /removeChannel|unsubscribe/.test(src) && /subscribe/i.test(src);
      return { status: ok ? "pass" : "fail" };
    },
  },
  {
    dim: "4-realtime",
    name: "useWidgetRealtime cleanup em unmount",
    blocking: true,
    run: () => {
      const p = `${DASH}/hooks/use-widget-realtime.ts`;
      const src = existsSync(p) ? readFileSync(p, "utf8") : "";
      const ok = /useEffect/.test(src) && /return\s*\(?\s*\)\s*=>/.test(src);
      return { status: ok ? "pass" : "warn", note: ok ? undefined : "cleanup não detectado" };
    },
  },
  // 5. Widget Registry — permissões e lazy
  {
    dim: "5-registry",
    name: "widget-registry tem permissões e lazy",
    blocking: true,
    run: () => {
      const p = "src/lib/dashboard/widget-registry.ts";
      const src = existsSync(p) ? readFileSync(p, "utf8") : "";
      const ok = /permission/i.test(src) && /lazy|import\(/.test(src);
      return { status: ok ? "pass" : "warn" };
    },
  },
  // 6. Performance — apenas baseline (registro, não bloqueia)
  {
    dim: "6-performance",
    name: "baseline snapshot presente",
    blocking: false,
    run: () => fileExists("docs/audits/phase1-perf-baseline.md"),
  },
  // 7. UX — skeleton e empty presentes
  {
    dim: "7-ux",
    name: "skeleton variants",
    blocking: false,
    run: () => {
      const p = `${DASH}/shell/widget-skeleton.tsx`;
      const src = existsSync(p) ? readFileSync(p, "utf8") : "";
      const ok = /kpi|list|chart|timeline/i.test(src);
      return { status: ok ? "pass" : "warn" };
    },
  },
  // 8. Código
  {
    dim: "8-codigo",
    name: "typecheck (tsgo)",
    blocking: true,
    run: () => cmd("bunx tsgo --noEmit"),
  },
  {
    dim: "8-codigo",
    name: "lint dashboard scope",
    blocking: true,
    run: () => cmd("bunx eslint src/components/dashboard scripts --max-warnings=999"),
  },
  {
    dim: "8-codigo",
    name: "rc1-gate agregado",
    blocking: false,
    run: () => cmd("bun run scripts/rc1-gate.ts"),
  },
];

const badge = (s: Status) => (s === "pass" ? "✅" : s === "warn" ? "⚠️ " : "❌");
const byDim = new Map<string, { status: Status; name: string; note?: string }[]>();
let failed = 0;
let warns = 0;

console.log("\n=== Phase 1 Gate — Dashboard Premium RC1 ===\n");
for (const c of checks) {
  const r = c.run();
  if (!byDim.has(c.dim)) byDim.set(c.dim, []);
  byDim.get(c.dim)!.push({ status: r.status, name: c.name, note: r.note });
  console.log(`${badge(r.status)} [${c.dim}] ${c.name}${r.note ? ` — ${r.note}` : ""}`);
  if (r.status === "fail" && c.blocking) failed++;
  if (r.status === "warn") warns++;
}

console.log(
  `\n${failed === 0 ? "APROVADO" : `REPROVADO — ${failed} bloqueantes`} · ${warns} avisos\n`,
);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(Object.fromEntries(byDim), null, 2));
}
process.exit(failed === 0 ? 0 : 1);
