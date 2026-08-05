# DISASTER RECOVERY — Zenda

Procedimento para cenários catastróficos: perda de dados, corrupção,
comprometimento de credenciais, indisponibilidade estendida.

## Objetivos (piloto WebMarcas)

- **RPO (Recovery Point Objective):** ≤ 24 h — perda máxima aceitável de dados.
- **RTO (Recovery Time Objective):** ≤ 4 h — tempo máximo para restaurar serviço.

Esses valores são adequados ao piloto (1 tenant, uso controlado). Devem ser
revistos antes da Fase 2 (multi-tenant público).

## Backups

- **Banco:** managed pelo Lovable Cloud / Supabase, retenção padrão.
- **Storage:** buckets privados (`message-media`, `agent-knowledge`, `avatars`, `contact-files`). Backup gerenciado pela plataforma.
- **Código:** versionado em git (histórico Lovable + repo).
- **Migrations:** versionadas em `supabase/migrations/` (54 arquivos, timestamps determinísticos).
- **Configuração:** secrets em `secrets--fetch_secrets` (nunca versionados em `.env`).

## Exportação manual

Antes de qualquer mudança de alto risco (ex.: virada de plano, migração grande):
- **Cloud → Advanced settings → Export data** (backup completo do banco).
- Salvar a exportação em local seguro fora da plataforma.

## Cenários de restore

### DR-1: Corrupção lógica em uma tabela

**Sintomas:** dados inconsistentes visíveis (ex.: `conversations.status` inválido em massa).

**Procedimento:**
1. Congelar escrita: desabilitar cron (`SELECT cron.alter_job(id, active:=false)` para os 3 jobs).
2. Identificar janela de corrupção (min/max timestamp via `supabase--read_query`).
3. Solicitar restore point-in-time via Lovable Cloud (Advanced → Restore).
4. Alternativamente, restaurar apenas as linhas afetadas a partir de backup lógico.
5. Revalidar consistência (query de sanidade).
6. Reativar cron.

**Validação:** `guardianRunSelect` com query de invariante retorna 0 rows.

### DR-2: Deleção acidental em massa

Idem DR-1, com prioridade Critical. Ativar `disable_signup: true` para
impedir novos usuários enquanto restaura.

### DR-3: Comprometimento de credencial (SERVICE_ROLE_KEY, LOVABLE_API_KEY)

**Procedimento imediato:**
1. Rotacionar a chave comprometida:
   - `SUPABASE_SERVICE_ROLE_KEY`: **não é rotacionável em Lovable Cloud** — abrir chamado urgente.
   - `LOVABLE_API_KEY`: `ai_gateway--rotate_lovable_api_key`.
   - `FLOW_SCHEDULER_SECRET`: `update_secret`.
2. Auditar `guardian_runs` / `team_audit_log` da janela suspeita.
3. Se possível, invalidar sessões: `supabase--configure_auth` com rate limit forte.
4. Notificar cliente do piloto se houver acesso a PII.

### DR-4: Indisponibilidade da plataforma > RTO

- Comunicar cliente com estimativa.
- Confirmar que publish anterior segue no ar (Lovable mantém último published).
- Se preview quebrado: continuar com produção.
- Se produção quebrada: abrir chamado urgente à Lovable + monitorar status page.

## Rotação de secrets (cadência mínima)

| Secret | Cadência | Método |
|---|---|---|
| `LOVABLE_API_KEY` | Semestral | `ai_gateway--rotate_lovable_api_key` |
| `FLOW_SCHEDULER_SECRET` | Semestral | `secrets--update_secret` (coordenar com cron) |
| `GUARDIAN_ALERT_WEBHOOK_URL` | Sob demanda (mudança de canal) | `secrets--update_secret` |
| `SUPABASE_*` | Managed | Não rotacionar manualmente |

Toda rotação deve ser precedida por comunicado no canal de plantão.

## Testes de DR

- **Mínimo:** validar 1 restore point-in-time a cada 90 dias em ambiente separado (não em produção do piloto).
- Registrar resultado em `docs/ops/incidents/dr-drill-YYYY-MM-DD.md`.
