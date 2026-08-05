# Missão 1 — Infraestrutura (3 HIGH)

**Data:** 2026-07-15
**Escopo:** Somente os 3 HIGH identificados na Auditoria Master 360° (F-0003, F-0004, F-0005). Sem Playwright completo, sem UX, sem performance.

## Resumo executivo

```
Missão 1
  HIGH corrigidos:    2/3
  HIGH won't-fix:     1/3 (documentado — infraestrutura Supabase)
  HIGH restantes:     0
  Risco atual:        Baixo (infra) / Alto (novo achado fora do escopo)
  Infraestrutura:     Aprovada
  Próximo passo:      Aguardar autorização para Missão 2 (Segurança dinâmica)
```

## Causa raiz por HIGH

### F-0003 — "Failed to fetch" (70 ocorrências) → ✅ RESOLVIDO

- **Causa raiz:** `tests/audit/nav-audit.py` navegava para a próxima rota antes das requisições Supabase (`_serverFn`, `auth/v1/user`) em voo completarem. Requisições abortadas por navegação surgem como `TypeError: Failed to fetch` no console da página anterior — é artefato do orquestrador de teste, não bug de produção.
- **Evidências:**
  - Logs de rede do usuário real (sessão live) mostram 200 em todos os `_serverFn/*` e `/auth/v1/user`. Zero `Failed to fetch`.
  - Stack trace dos erros aponta consistentemente para `src/integrations/supabase/client.ts:17` (a chamada `fetch()` do cliente), disparada por hooks/queries que ficaram pendentes durante a troca de rota.
  - Re-execução com `wait_for_load_state('networkidle')` antes do screenshot: **0 `Failed to fetch`** em 24 rotas.
- **Correção mínima:** apenas `tests/audit/nav-audit.py` — adicionado `networkidle` (timeout 8s) + filtro que separa artefatos ambientais dos erros reais. Nenhuma linha de produto alterada.
- **Validação:** `python3 tests/audit/nav-audit.py` → `real console errors: 4 | Failed-to-fetch remaining: 0 | non-200 routes: []`.

### F-0004 — 12 funções `SECURITY DEFINER` expostas → ✅ RESOLVIDO

- **Diagnóstico:** 11 funções DEFINER em `public` (relatório original superestimou "12"). Todas já possuem `SET search_path = public`. O real risco eram 5 delas com `EXECUTE` concedido a `anon`.
- **Classificação:**

| Função | Ação | Racional |
|---|---|---|
| `accept_invite_token` | REVOKE anon/PUBLIC → GRANT authenticated | Requer sessão via `auth.uid()`. Anon não deve nem tentar. |
| `flow_run_acquire_lock` | REVOKE anon/PUBLIC → GRANT authenticated + service_role | Lock interno; anon não tem uso legítimo. |
| `flow_run_release_lock` | REVOKE anon/PUBLIC → GRANT authenticated + service_role | Idem. |
| `has_permission` | REVOKE anon/PUBLIC → GRANT authenticated | Sonda de permissão — anon poderia enumerar perms. |
| `my_effective_permissions` | REVOKE anon/PUBLIC → GRANT authenticated | Usa `auth.uid()`; anon não deve invocar. |
| `exec_read_sql` | REVOKE PUBLIC/anon/authenticated (reforço) | Ferramenta interna, restrita a `service_role`. |
| `has_role`, `is_company_member`, `current_company_id`, `handle_new_user`, `create_default_subscription` | Sem alteração | Já sem acesso anon; padrão Supabase para RLS não-recursivo. |

- **Correção:** migration `20260715-184028_c123d3f7...` — apenas `REVOKE`/`GRANT`, nenhuma alteração de corpo, assinatura ou `search_path`. Idempotente e sem rollback destrutivo (revertível com GRANTs opostos).
- **Validação pós-migration:** `security--run_security_scan` → 0 findings `SUPA_anon_security_definer_function_executable`. As 8 findings `authenticated_security_definer_function_executable` restantes são **by-design** (helpers de RLS obrigatórios; ver security memory) e foram ignoradas com justificativa.

### F-0005 — Extensões no schema `public` → ⚠️ WON'T-FIX (documentado)

- **Diagnóstico:** Única extensão em `public` é `pg_net` (v0.20.3), instalada e gerenciada pelo Supabase Cloud. `pgcrypto`, `uuid-ossp` e `pg_stat_statements` já estão no schema `extensions`.
- **Decisão:** conforme regra do plano ("nunca mover extensão apenas para eliminar aviso do linter, confirmar recomendação oficial primeiro"), `pg_net` NÃO é candidata a mudança de schema — mover pode quebrar funcionalidades do próprio Supabase (webhooks internos, edge triggers). Warning `0014_extension_in_public` para `pg_net` é aceito como custo residual de infraestrutura gerenciada.
- **Ação:** documentado em `security-memory` para não voltar a ser flageado.

## Comandos executados no gate de encerramento

- `python3 tests/audit/nav-audit.py` — 0 `Failed to fetch`, 24 rotas 200.
- `security--run_security_scan` — 0 findings anon SECURITY DEFINER; 8 authenticated (by-design, ignorados); 1 warn realtime (informativo).
- Nenhum `bun run build` / `tsgo` executado nesta missão — nenhuma alteração de código de produto foi feita (apenas migration SQL + script de teste). Gate estático já validado na auditoria anterior segue válido.

## ⚠️ Achado fora do escopo (escalado, NÃO corrigido)

Durante o scan de validação, um novo finding **ERROR** apareceu, fora dos 3 HIGH originais:

- **`pending_invites_anon_token_exposure`** — política RLS `USING (true)` no papel `anon` expõe *todos* os convites pendentes (emails, tokens, roles, company_id) para qualquer visitante não autenticado. Um atacante pode enumerar convites de todas as companhias e sequestrar tokens para se juntar a uma empresa com role escolhido.
- **Status:** Registrado em `findings.json`. NÃO corrigido nesta missão (fora do escopo declarado).
- **Recomendação:** abrir imediatamente como **Missão 2 (Segurança dinâmica)** ou tratar como hotfix crítico antes da Missão 2 completa.

## Parecer técnico

Infraestrutura **APROVADA**. Os 3 HIGH originais estão fechados (2 corrigidos, 1 won't-fix justificado). O novo achado de exposição de convites pendentes NÃO pertence a esta missão e requer autorização explícita para tratamento.

**Próximo passo recomendado:** aguardar decisão do usuário — hotfix isolado do `pending_invites` OU início da Missão 2 (Segurança dinâmica / OWASP) englobando esse achado.
