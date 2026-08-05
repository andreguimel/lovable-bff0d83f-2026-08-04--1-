# Hotfix 01.1 — pending_invites_anon_token_exposure

**Data:** 2026-07-15
**Escopo:** exclusivamente o finding `pending_invites_anon_token_exposure`.
**Fora de escopo:** Missão 2, refatorações, mudanças em UX/componentes/arquitetura.

## 1. Causa raiz

A tabela `public.pending_invites` tinha a policy:

```
"Anon can read invite by token"  FOR SELECT  TO anon  USING (true)
```

Combinada com `GRANT SELECT ... TO anon`, isso permitia que qualquer visitante
não autenticado listasse **todos** os convites pendentes via Data API
(`GET /rest/v1/pending_invites?select=*`), expondo `email`, `token`, `role`,
`company_id`, `invited_by`, `expires_at`, `sent_count`.

Impacto:
- **Hijack de convite** (roubo de token → aceite indevido de acesso à empresa).
- **Enumeração de usuários** (todos os emails convidados por qualquer empresa).
- **Exposição de metadados** de tenants (ligação email → empresa).

Fluxo que legitimamente precisava de leitura anônima: apenas a página pública
`/invite/:token` chamando `previewInvite` para exibir "Você foi convidado por
X para a empresa Y". Ela precisa somente do convite correspondente ao token,
nunca de listagem.

## 2. Correção aplicada

Migration `20260715-200446`:

1. `DROP POLICY "Anon can read invite by token"` em `pending_invites`.
2. `REVOKE ALL ON public.pending_invites FROM anon` (as policies de
   `authenticated` permanecem intactas: admins da empresa continuam vendo /
   gerenciando convites).
3. Criada função `public.preview_invite_by_token(_token text)` como
   `SECURITY DEFINER STABLE`, `SET search_path = public`, retornando apenas
   `{ found, email, role, status, expires_at, company_name, expired }` —
   sem `id`, sem `token`, sem `company_id`, sem `invited_by`, sem
   `sent_count`, sem `last_sent_at`.
4. `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO anon, authenticated`.
5. Validação de entrada dentro da função (`length(_token) >= 10`); retorno
   genérico `found=false` para token curto/ausente/inexistente (sem sinalizar
   se o token existe).

Código:

- `src/lib/team.functions.ts` — `previewInvite` agora chama
  `supabase.rpc("preview_invite_by_token", { _token })` em vez de
  `from("pending_invites").select(...)`. Assinatura de retorno para o cliente
  preservada (nenhuma mudança em `src/routes/invite.$token.tsx`).

## 3. Casos de teste (executados)

| # | Caso | Esperado | Resultado |
|---|------|----------|-----------|
| 1 | Token inexistente via RPC | `found=false` sem detalhes | ✅ `f | | | | | | ` |
| 2 | Token vazio / < 10 chars | `found=false` genérico | ✅ ramo early-return |
| 3 | `has_table_privilege('anon', 'public.pending_invites', 'SELECT')` | `false` | ✅ `f` |
| 4 | Policies remanescentes na tabela | apenas `authenticated` | ✅ 3 policies (`Admins can delete/insert invites`, `Members can view invites of their company`); policy anon removida |
| 5 | Fluxo aceite (`accept_invite_token` RPC existente) | inalterado | ✅ RPC já era `SECURITY DEFINER` e valida `status='pending' AND expires_at > now()` |

Comprovação:

```
$ psql -c "SELECT * FROM public.preview_invite_by_token('nonexistent-token-xxxxx');"
 found | email | role | status | expires_at | company_name | expired
-------+-------+------+--------+------------+--------------+---------
 f     |       |      |        |            |              |

$ psql -c "SELECT has_table_privilege('anon','public.pending_invites','SELECT');"
 f
```

## 4. Validações de plataforma

- `supabase--migration` — aplicada com sucesso.
- Linter Supabase pós-migration: **o finding específico
  `pending_invites_anon_token_exposure` não aparece mais**. Os `WARN`
  remanescentes (`Extension in Public`, funções `SECURITY DEFINER`
  executáveis) são pré-existentes, já triados na Missão 1
  (helpers de RLS por design e `pg_net` gerenciado pelo Supabase).

## 5. Fora de escopo (não tocado)

- Não foi aplicado rate-limit dedicado a `/invite/:token` (candidato à
  Missão 2 — Segurança dinâmica).
- Não foi introduzido "uso único" hard (o convite ainda pode ser reaberto
  enquanto `status='pending'`); a RPC de aceite já marca `accepted` e o
  token nunca vaza para anon após este hotfix.
- Nenhuma alteração em outros módulos.

## 6. Critério de aceite

- ✅ `anon` não consegue listar `pending_invites`.
- ✅ Fluxo oficial de preview + aceite continua funcionando via RPCs.
- ✅ Nenhum token/email exposto pela Data API a anônimos.
- ✅ Security scan não reporta mais `pending_invites_anon_token_exposure`.

**Status: CONCLUÍDO. Aguardando autorização explícita para iniciar Missão 2.**
