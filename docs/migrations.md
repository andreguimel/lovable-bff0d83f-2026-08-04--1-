# Migration Standards

Toda migration em `supabase/migrations/` DEVE:

1. Ser idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
2. Definir GRANT explícito para tabelas em `public` (ver `public-schema-grants`).
3. Habilitar RLS + criar policies antes de qualquer INSERT.
4. Criar índices para toda FK.
5. Incluir bloco de rollback como comentário no topo.

## Validador

`scripts/validate-migration.ts` roda em pre-commit e verifica:

- Presença de `IF NOT EXISTS` em `CREATE TABLE` / `ADD COLUMN`
- Presença de `GRANT` para cada `CREATE TABLE public.*`
- Presença de `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` para novas tabelas
- Comentário `-- ROLLBACK:` explicando reversibilidade
- Ausência de statements proibidos (`ALTER DATABASE`, DROP em produção)

## Rollback simulation

O gate RC1 executa cada migration em ordem, aplica o rollback declarado, e
reaplica — o resultado final deve ser bit-a-bit idêntico ao original.
