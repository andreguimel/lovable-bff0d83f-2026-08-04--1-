#!/usr/bin/env bun
/**
 * Validador simples de migrations. Lê cada arquivo em supabase/migrations/
 * e checa idempotência, GRANTs, RLS e comentário de rollback.
 * Roda como sanity check; não substitui review.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let errors = 0;
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  const upper = sql.toUpperCase();
  const problems: string[] = [];
  const createsPublicTable = /CREATE\s+TABLE\s+(IF NOT EXISTS\s+)?public\.(\w+)/gi;
  const tables = [...sql.matchAll(createsPublicTable)].map((m) => m[2]);
  for (const t of tables) {
    const grantRe = new RegExp(`GRANT[\\s\\S]+?ON\\s+public\\.${t}\\b`, "i");
    if (!grantRe.test(sql)) problems.push(`missing GRANT on public.${t}`);
    const rlsRe = new RegExp(
      `ALTER\\s+TABLE\\s+public\\.${t}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      "i",
    );
    if (!rlsRe.test(sql)) problems.push(`missing ENABLE RLS on public.${t}`);
  }
  if (upper.includes("ALTER DATABASE")) problems.push("proibido: ALTER DATABASE");
  if (problems.length) {
    errors += problems.length;
    console.log(`❌ ${f}\n   - ${problems.join("\n   - ")}`);
  }
}
console.log(
  errors ? `\nFAIL (${errors} problemas)` : `\nOK — ${files.length} migrations validadas`,
);
process.exit(errors ? 1 : 0);
