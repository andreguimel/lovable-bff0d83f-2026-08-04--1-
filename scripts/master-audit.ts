#!/usr/bin/env bun
/**
 * Master Audit 360° — orquestrador one-shot.
 * Executa auditorias estáticas + coleta findings + gera relatório em docs/audits/master-audit/.
 * NÃO corrige código. Correções são responsabilidade da fase 9, revisada manualmente.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Sev = "critical" | "high" | "medium" | "low" | "info";
type Finding = {
  id: string;
  dim: string;
  module: string;
  severity: Sev;
  title: string;
  evidence?: string;
  fix_ref?: string;
};

const OUT = "docs/audits/master-audit";
mkdirSync(`${OUT}/evidence`, { recursive: true });

const findings: Finding[] = [];
let nextId = 1;
const add = (f: Omit<Finding, "id">) => findings.push({ id: `F-${String(nextId++).padStart(4, "0")}`, ...f });

const run = (cmd: string, timeoutMs = 120_000): { code: number; out: string } => {
  try {
    const out = execSync(cmd, { stdio: "pipe", timeout: timeoutMs, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
    return { code: 0, out };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer; message?: string };
    return {
      code: err.status ?? 1,
      out: (err.stdout?.toString() ?? "") + "\n" + (err.stderr?.toString() ?? "") + (err.message ?? ""),
    };
  }
};

// ---- Fase 1: Estáticos ----
console.log("=== Fase 1: Estáticos ===");

const tsc = run("bunx tsgo --noEmit");
if (tsc.code !== 0) {
  add({ dim: "codigo", module: "typescript", severity: "critical", title: "Typecheck falhou", evidence: tsc.out.slice(-2000) });
}
writeFileSync(`${OUT}/evidence/typecheck.log`, tsc.out);

const lint = run("bunx eslint . -f json", 240_000);
let lintErrors = 0, lintWarns = 0;
try {
  const parsed = JSON.parse(lint.out);
  for (const f of parsed) {
    lintErrors += f.errorCount ?? 0;
    lintWarns += f.warningCount ?? 0;
  }
} catch { /* ignore */ }
if (lintErrors > 0) {
  add({
    dim: "codigo",
    module: "lint",
    severity: lintErrors > 1000 ? "high" : "medium",
    title: `Lint: ${lintErrors} erros, ${lintWarns} warnings no repositório`,
    evidence: `Ver evidence/lint.json (parsed count).`,
  });
}
writeFileSync(`${OUT}/evidence/lint-summary.json`, JSON.stringify({ errors: lintErrors, warnings: lintWarns }, null, 2));

const madge = run("bunx madge --circular --extensions ts,tsx src");
writeFileSync(`${OUT}/evidence/madge-circular.log`, madge.out);
if (/Found \d+ circular/i.test(madge.out) && !/Found 0/.test(madge.out)) {
  add({ dim: "arquitetura", module: "graph", severity: "high", title: "Dependências circulares detectadas", evidence: madge.out.slice(0, 2000) });
}

const orphans = run("bunx madge --orphans --extensions ts,tsx src");
writeFileSync(`${OUT}/evidence/madge-orphans.log`, orphans.out);
const orphanLines = orphans.out.split("\n").filter(l => l.trim() && !/^Processed|^No orphan|orphans found/i.test(l));
if (orphanLines.length > 5) {
  add({ dim: "codigo", module: "dead-code", severity: "low", title: `${orphanLines.length} arquivos órfãos`, evidence: orphanLines.slice(0, 30).join("\n") });
}

// throw new Error legacy count
let legacyThrow = 0;
for (const f of readdirSync("src/lib").filter(f => f.endsWith(".functions.ts"))) {
  const src = readFileSync(`src/lib/${f}`, "utf8");
  if (/throw new Error\(/.test(src)) legacyThrow++;
}
if (legacyThrow > 0) {
  add({ dim: "codigo", module: "errors", severity: "medium", title: `${legacyThrow} arquivos .functions.ts ainda usam throw new Error() em vez de AppError`, fix_ref: "ADR-005" });
}

// ---- Fase 2: Inventário de rotas ----
console.log("=== Fase 2: Inventário de rotas ===");
const routeFiles = readdirSync("src/routes").filter(f => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.startsWith("__"));
const routes: string[] = [];
for (const f of routeFiles) {
  const src = readFileSync(`src/routes/${f}`, "utf8");
  const m = src.match(/createFileRoute\(["']([^"']+)["']\)/);
  if (m) routes.push(m[1]);
}
writeFileSync(`${OUT}/evidence/routes.json`, JSON.stringify(routes, null, 2));
console.log(`Descobertas ${routes.length} rotas`);

// ---- Fase 3: Bundle size (build) ----
console.log("=== Fase 3: Build & bundle ===");
const build = run("bun run build", 300_000);
writeFileSync(`${OUT}/evidence/build.log`, build.out.slice(-20_000));
if (build.code !== 0) {
  add({ dim: "codigo", module: "build", severity: "critical", title: "Build de produção falhou", evidence: build.out.slice(-3000) });
}

// bundle sizes
type Chunk = { file: string; kb: number };
const chunks: Chunk[] = [];
const walk = (dir: string) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(js|css)$/.test(e)) chunks.push({ file: p, kb: Math.round(s.size / 1024) });
  }
};
walk(".output");
walk("dist");
chunks.sort((a, b) => b.kb - a.kb);
writeFileSync(`${OUT}/evidence/bundle-top.json`, JSON.stringify(chunks.slice(0, 20), null, 2));
const totalKb = chunks.reduce((s, c) => s + c.kb, 0);
const biggest = chunks[0];
if (biggest && biggest.kb > 1500) {
  add({ dim: "performance", module: "bundle", severity: "medium", title: `Chunk grande: ${biggest.file} (${biggest.kb} KB)`, evidence: JSON.stringify(chunks.slice(0, 5)) });
}

// ---- Persistência ----
const summary = {
  generated_at: new Date().toISOString(),
  static: {
    typecheck: tsc.code === 0 ? "pass" : "fail",
    lint_errors: lintErrors,
    lint_warnings: lintWarns,
    circular_deps: /Found 0|No circular/i.test(madge.out) ? 0 : "see log",
    orphan_files: orphanLines.length,
    legacy_throw_files: legacyThrow,
  },
  routes: routes.length,
  build: build.code === 0 ? "pass" : "fail",
  bundle_total_kb: totalKb,
  bundle_top: chunks.slice(0, 10),
  findings,
};
writeFileSync(`${OUT}/findings.json`, JSON.stringify(summary, null, 2));

console.log(`\n=== ${findings.length} findings ===`);
for (const f of findings) console.log(`[${f.severity.toUpperCase()}] ${f.id} ${f.dim}/${f.module}: ${f.title}`);
process.exit(0);
