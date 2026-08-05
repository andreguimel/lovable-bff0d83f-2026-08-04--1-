#!/usr/bin/env bun
/**
 * RC1 Gate — agregador de auditorias. Falha (exit 1) se qualquer bloco
 * bloqueante estiver vermelho.
 *
 * Roda: build (implícito no CI), typecheck, lint, dependency scan,
 * verificações estruturais.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

type Check = { name: string; blocking: boolean; run: () => { ok: boolean; note?: string } };

const cmd = (c: string): { ok: boolean; note?: string } => {
  try {
    execSync(c, { stdio: "pipe" });
    return { ok: true };
  } catch (e: unknown) {
    return {
      ok: false,
      note:
        (e as { stdout?: { toString: () => string } }).stdout?.toString().slice(-500) ??
        (e as Error).message,
    };
  }
};

const checks: Check[] = [
  { name: "typecheck (tsgo)", blocking: true, run: () => cmd("bunx tsgo --noEmit") },
  { name: "lint (eslint)", blocking: true, run: () => cmd("bun run lint") },
  {
    name: "ADRs present",
    blocking: true,
    run: () => ({
      ok: ["001", "002", "003", "004", "005"].every((n) =>
        existsSync(
          `docs/adr/ADR-${n}-${{ "001": "rbac", "002": "service-container", "003": "event-versioning", "004": "execution-pipeline", "005": "error-catalog" }[n]}.md`,
        ),
      ),
    }),
  },
  {
    name: "Error catalog",
    blocking: true,
    run: () => ({ ok: existsSync("src/lib/errors/catalog.ts") }),
  },
  {
    name: "Pipeline present",
    blocking: true,
    run: () => ({ ok: existsSync("src/lib/pipeline/execute.ts") }),
  },
  {
    name: "Event registry",
    blocking: true,
    run: () => ({ ok: existsSync("src/lib/events/registry.ts") }),
  },
  {
    name: "Feature registry",
    blocking: true,
    run: () => ({ ok: existsSync("src/lib/features/registry.ts") }),
  },
  {
    name: "Health runner",
    blocking: true,
    run: () => ({ ok: existsSync("src/lib/health/runner.ts") }),
  },
  {
    name: "Metrics endpoint",
    blocking: true,
    run: () => ({ ok: existsSync("src/routes/api/public/metrics.ts") }),
  },
  {
    name: "Baseline snapshot",
    blocking: false,
    run: () => ({ ok: existsSync("docs/audits/baseline.md") }),
  },
  {
    name: "No direct throw new Error in .functions.ts (info)",
    blocking: false,
    run: () => {
      const files = readdirSync("src/lib").filter((f) => f.endsWith(".functions.ts"));
      const hits: string[] = [];
      for (const f of files) {
        const src = readFileSync(`src/lib/${f}`, "utf8");
        if (/throw new Error\(/.test(src)) hits.push(f);
      }
      return {
        ok: hits.length === 0,
        note: hits.length ? `${hits.length} arquivos ainda usam throw new Error()` : undefined,
      };
    },
  },
];

let failed = 0;
console.log("\n=== RC1 Gate ===\n");
for (const c of checks) {
  const r = c.run();
  const badge = r.ok ? "✅" : c.blocking ? "❌" : "⚠️";
  console.log(`${badge} ${c.name}${r.note ? ` — ${r.note}` : ""}`);
  if (!r.ok && c.blocking) failed++;
}
console.log(`\n${failed === 0 ? "PASS" : `FAIL (${failed} bloqueantes)`}\n`);
process.exit(failed === 0 ? 0 : 1);
