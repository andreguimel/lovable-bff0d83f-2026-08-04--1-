# Release Checklist

Obrigatório antes de publicar qualquer release.

## Gates automatizados

- [ ] `bun run build` verde
- [ ] typecheck verde
- [ ] `bun run lint` verde
- [ ] `bun run test:e2e` verde (todas as suítes)
- [ ] `bun run test:visual` sem drift > 0.1%
- [ ] `bun run test:perf` dentro do `perf-budget.json`
- [ ] `bunx knip --production` sem código morto novo

## Gates manuais

- [ ] `rg "has_role\(" src --glob '!src/lib/rbac/guard.ts' --glob '!src/integrations/supabase/types.ts'` vazio
- [ ] Nenhuma nova mutação sem entrada correspondente em `docs/domain-events.md`
- [ ] Migrations revisadas: RLS habilitado, GRANTs presentes, idempotentes
- [ ] Health check `/api/public/health` responde OK contra deploy
- [ ] Feature flags novas listadas em `docs/feature-flags.md`
- [ ] Changelog atualizado
