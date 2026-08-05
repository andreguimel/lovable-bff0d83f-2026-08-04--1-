# Fase 1.5A — Hardening Pré-Piloto

Missão cirúrgica autorizada em cima da recomendação da Fase 1. Escopo restrito
a dois itens **High** de segurança. Sem refatoração, sem alteração de
arquitetura, sem tocar Runtime/RBAC/RLS/Providers.

---

## SEC-H-01 — `public.exec_read_sql` fortalecida

**Risco original:** função `SECURITY DEFINER` com parser textual bypassável
(`position('insert ' in lower_sql)`) — comentários SQL, aspas escapadas,
CTEs poderiam driblar o filtro.

**Estado antes:**
- `EXECUTE` já revogado de `PUBLIC`, `anon`, `authenticated` (migrations
  20260715005908, 20260715014347, 20260715184012).
- Somente `service_role` executa (via `supabaseAdmin` em
  `src/lib/guardian.functions.ts::guardianRunSelect`).
- Ainda assim, `service_role` bypassa RLS — qualquer bypass do parser
  significaria escrita real no banco.

**Correção aplicada (migration 20260717-033306):**

1. **Sanitização mais estrita**
   - `p_sql IS NULL` → erro imediato.
   - `;` interno proibido (múltiplas instruções bloqueadas).
   - Regex obrigatória `^\s*(select|with)\s` — a query precisa começar com
     `SELECT` ou `WITH`.
2. **Defesa real no nível do Postgres**
   - `SET LOCAL transaction_read_only = on;` antes do `EXECUTE`.
   - Qualquer `INSERT/UPDATE/DELETE/DDL` executado dentro da query falha
     com `cannot execute ... in a read-only transaction`, mesmo que o
     parser textual seja burlado.
3. **Grants reforçados (idempotente)**
   - `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
   - `GRANT EXECUTE ... TO service_role`.

**Compatibilidade:** `guardianRunSelect` já monta a query como
`SELECT * FROM (<user_sql>) AS q LIMIT 200` — passa naturalmente pelo novo
filtro `^select`. Nenhuma outra call-site no repositório.

**Resultado:** vulnerabilidade fechada por dupla camada (parser + Postgres
read-only). Bypass agora requer burlar o próprio `SET LOCAL
transaction_read_only`, o que não é possível a partir de código SQL de
usuário.

---

## SEC-H-03 — Password HIBP Check ativado

Ativado via `configure_auth` (`password_hibp_enabled: true`). Toda senha
nova ou trocada passa a ser verificada contra o banco Have I Been Pwned;
senhas conhecidas em vazamentos são rejeitadas no signup/reset.

Outros flags de auth preservados:
- `disable_signup: false`
- `external_anonymous_users_enabled: false`
- `auto_confirm_email: false`

Nenhum impacto em usuários existentes até a próxima troca de senha.

---

## Validação

- Migração aplicada com sucesso; linter da Supabase não reportou novos
  achados (12 warnings pré-existentes, todos já rastreados no backlog
  master `F-0004`/`F-0005`).
- `exec_read_sql` continua callable por `service_role`; call-path do
  Guardião permanece intacto.
- HIBP confirmado ativo no ambiente.

## Escopo respeitado

- ✅ Congelamento RC3.1 preservado.
- ✅ Nenhuma refatoração, nenhum arquivo de código de aplicação
  alterado (apenas migration + configuração de auth).
- ✅ Runtime, RBAC, RLS, providers, event bus, storage: intactos.

## Status

**Encerrada.** Backlog atualizado: `SEC-H-01` e `SEC-H-03` fechados.
Pendentes recomendados (Fase 1.5B, ainda não autorizada): `OBS-H-01`,
`OPS-H-01`.
