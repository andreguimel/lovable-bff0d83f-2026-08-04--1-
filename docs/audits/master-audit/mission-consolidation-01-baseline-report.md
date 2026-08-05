# Sub-missão 1 — Segurança + QA Baseline (Read-Only)

**Data:** 2026-07-16
**Escopo:** Somente leitura. Nenhum arquivo de produção alterado.
**Modo:** Baseline pré-auditorias.

---

## 1. Resultados

| Verificação        | Resultado                                         |
| ------------------ | ------------------------------------------------- |
| Build (`bun run build`) | ✅ **PASS** — `✓ built in 1.57s`, nitro OK       |
| Typecheck (`tsgo --noEmit`) | ✅ **PASS** — 0 erros                        |
| Testes (`bun test`) | ✅ **PASS** — **56/56 pass**, 177 expects, 5 arquivos |
| Dependency Scan    | ✅ **PASS** — 0 vulnerabilidades high/critical    |
| Security Scan      | ⚠️ 10 findings (todos `warn`)                     |
| Supabase Linter    | ⚠️ 11 warnings                                    |

---

## 2. Findings classificados

### 🔴 Crítico
Nenhum.

### 🟠 Alto
Nenhum **novo**. Os itens R2-C-01 e R2-H-02..H-06 já estão no backlog (Runtime-02) e serão tratados nas sub-missões 2 e 7.

### 🟡 Médio (backlog)
- **SEC-BASELINE-01** — 10 funções `SECURITY DEFINER` com `EXECUTE` para `authenticated` (lint 0029). Já rastreado como F-0004 no backlog. Ação: revisar caso a caso; muitos são helpers legítimos (`has_role`, etc.). Não é bug crítico.
- **SEC-BASELINE-02** — 1 função `SECURITY DEFINER` executável por `anon` (lint 0028). Precisa investigação individual para confirmar se é intencional (health check público?) ou vazamento.

### 🔵 Baixo (backlog)
- **SEC-BASELINE-03** — Extensão instalada em schema `public` (lint 0014). Já rastreado como F-0005.

### ✅ Nada a fazer
- **Test runners heterogêneos**: 3 suites usam `bun:test` (server functions, deletion contract, message deletion runtime) e o restante roda por vitest. Ambos os runners passam quando invocados corretamente. Não é bug — é apenas uma nota de ergonomia (padronizar num runner só ficaria no backlog como polimento, mas não é regressão).

---

## 3. Evidências (comandos executados)

```
$ bun test              → 56 pass / 0 fail / 5 files
$ bunx tsgo --noEmit    → clean
$ bun run build         → dist/ + wrangler.json + nitro.json gerados
$ code--dependency_scan → 0 high/critical
$ supabase--linter      → 11 warn
$ security--run_security_scan → 10 warn (0 error/critical)
```

---

## 4. Atualização de backlog

Nada a adicionar. Todos os findings encontrados já constam do backlog (F-0004, F-0005) ou são metadados/duplicados dos lints do Supabase. Sem novos itens.

---

## 5. Decisão

**Status:** ✅ **Encerrada**

Baseline verde:
- Build/typecheck/testes 100% passando.
- Zero vulnerabilidades de dependência.
- Zero findings críticos ou altos novos.
- Warnings existentes já estão no backlog.

⛔ **PARADO.** Aguardando autorização explícita para a **Sub-missão 2 (Auditoria Runtime — read-only)**.
