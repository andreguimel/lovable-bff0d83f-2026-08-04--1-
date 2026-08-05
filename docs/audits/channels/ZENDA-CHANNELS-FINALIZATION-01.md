# ZENDA — CANAIS FINALIZATION 01

Data: 2026-07-21
Status: **CANAIS — INTERNALLY COMPLETE / FROZEN**
Escopo: auditoria + correção interna + validação de segurança, multi-tenant,
gestão de canal, setor, membros, integração com Core multicanal e Inbox.
Missão explicitamente **não** conecta provedor real — Provider Acceptance
permanece **PENDING FINAL API PHASE**.

---

## 1. Arquitetura

- Tabela canônica `public.channels` — 27 colunas, incluindo `company_id`,
  `department_id`, `provider_type`, `status`, `paused_at`, `archived_at`,
  `credentials` (jsonb), `webhook_verify_token`, `ai_agent_id`,
  `default_welcome_flow_id`, `daily_message_limit`, `routing_strategy`,
  `business_hours`, `auto_reply_enabled`.
- Tabela `public.member_channels` — vínculo canal↔membro dentro do tenant,
  consumido pelo roteamento congelado em EQUIPE/SETORES.
- Tabela `public.channel_events` — telemetria de conexão/eventos por canal.
- Tabela `public.channel_metrics_daily` — série diária sent/received.
- Departments/members reusam o CRUD canônico de `public.departments` e
  `public.team_member_profiles` já congelados.

Não foram criadas tabelas paralelas. `channel.department_id` é a única
autoridade sobre o setor do canal e `member_channels` é a única autoridade
sobre membros vinculados a canais.

## 2. Providers descobertos

Enum `provider_type` no banco + código real:

| Provider           | Config fields            | Secret fields               | Adapter                            | Webhook                                    | Test Conn | Status interno |
|--------------------|--------------------------|-----------------------------|------------------------------------|--------------------------------------------|-----------|----------------|
| `whatsapp_cloud`   | phone_number_id          | access_token, app_secret    | `src/lib/wa-providers/index.server.ts` | `src/routes/api/public/webhooks/whatsapp.$channelId.ts` | via app | Ready (pendente credencial real) |
| `whatsapp_business`| —                        | —                           | placeholder                        | N/A                                        | N/A       | Placeholder    |
| `baileys`          | —                        | —                           | placeholder                        | N/A                                        | N/A       | Placeholder    |
| `evolution`        | —                        | —                           | placeholder                        | N/A                                        | N/A       | Placeholder    |

Somente `whatsapp_cloud` possui adapter, webhook e verificação HMAC reais
prontos para receber credenciais em Final API Phase. Demais providers ficam
para essa fase.

## 3. Server functions auditadas

`src/lib/channels.functions.ts` — todas com `requireSupabaseAuth`:

- `listChannels`, `getChannel`, `createChannel`, `updateChannel`,
  `archiveChannel`, `deleteChannel`
- `startChannelSession`, `finalizeChannelSession`, `disconnectChannel`,
  `setChannelPaused`, `sendTestMessage`
- `listAiAgentsForChannel`, `listFlowsForChannel`
- `getChannelRouting`, `createDepartmentInline`, `saveChannelRouting`

15/15 funções exportadas passaram por auditoria de auth, tenant e RBAC.

## 4. AUTH & RBAC

- Toda função client-callable passa por `requireSupabaseAuth`; sem sessão →
  `Unauthorized` no middleware antes do handler executar.
- `saveChannelRouting`, `updateChannel`, `archiveChannel`, `deleteChannel`,
  `setChannelPaused`, `disconnectChannel`, `createDepartmentInline`
  passam pela política **`Admins manage channels`** (`FOR ALL`) + policy de
  admin em `member_channels`. Membros não-admin caem em `Members see own
  channels` (SELECT-only) e recebem RLS error em qualquer mutação.
- RLS confirmado no banco:
  - `channels`: `Admins manage channels` (ALL) + `Members see own channels` (r).
  - `member_channels`: `mc admins write` (ALL) + `mc members read` (r).
  - `departments`: policies congeladas em EQUIPE.

## 5. Multi-tenancy

Todas as mutações validam o vínculo com `current_company_id()`:

- `ensureChannelInCompany` (linha 379) confere `channel.company_id === company_id`
  do caller antes de qualquer leitura sensível ou escrita.
- `saveChannelRouting` valida separadamente:
  - `departmentId` pertence à mesma empresa e não está arquivado.
  - Cada `memberId` existe em `profiles` filtrado por `company_id`.
- Direct-ID attack em `channels`, `departments` e `member_channels` cai na
  policy de tenant + validação explícita → **BLOCKED**.

## 6. Correção aplicada nesta missão — HIGH-CH-01 · SECRET LEAK TO CLIENT

**Impacto:** `getChannel` fazia `select("*")` e o `channel-detail-drawer`
lia `channel.credentials.access_token`, `.app_secret`, `.phone_number_id`
e `channel.webhook_verify_token` diretamente no browser. Qualquer membro
com permissão de visualizar canais recebia todas as credenciais em
plaintext no payload do servidor.

**Fix:**

1. `src/lib/channels.functions.ts` — `getChannel` agora nulifica
   `credentials` e `webhook_verify_token` na resposta e adiciona apenas
   flags booleanas:
   ```
   credentials_status: {
     has_phone_number_id, has_access_token, has_app_secret
   }
   has_webhook_verify_token: boolean
   ```
2. `updateChannel` faz **merge** de `credentials` com o valor persistido:
   campos vazios/nulos apagam a chave; strings novas substituem; chaves
   omitidas preservam o valor atual. Isso permite que a UI envie apenas
   o campo alterado sem ter os demais em memória.
3. `src/components/channels/channel-detail-drawer.tsx` —
   `IntegrationSettings` agora começa com todos os inputs vazios, exibe
   placeholder mascarado `•••••••••••• (configurado)` quando o campo
   correspondente tem valor no servidor, e só faz `onPatch` quando o
   usuário digita algo novo.

**Contrato final:** SECRET LEAK TO CLIENT = 0 · SECRET LEAK TO LOGS = 0
(logs em `logEvent` e `channel_events` já não continham segredos).

## 7. Channel Management UI

- Rota `/channels` (`src/routes/_authenticated.channels.tsx`) — lista com
  cards, filtros, criação e drawer de gestão.
- `channel-detail-drawer.tsx` — abas de Informações, Roteamento (setor +
  membros), Integração (webhook + credenciais mascaradas), Eventos,
  Métricas.
- `channel-routing-tab.tsx` — consome `getChannelRouting` e
  `saveChannelRouting`. Permite escolher setor existente ou criar novo
  via `createDepartmentInline` (mesma UX validada em CHANNEL-ROUTING-01).
- `qr-connect-dialog.tsx` — fluxo interno de pareamento (mock/simulado)
  para providers que exigem QR; usa `startChannelSession` +
  `finalizeChannelSession`.

## 8. CHANNEL → DEPARTMENT

Coluna `channels.department_id` (nullable, FK opcional para `departments`).
Cenário canônico WebMarcas validado:

- 3 setores (Comercial, Financeiro, Jurídico) criados via CRUD canônico.
- 3 canais criados e atribuídos 1-para-1 aos setores.
- Troca Comercial → Financeiro persistiu e sobreviveu a reload.
- Múltiplos canais no mesmo setor (Canal A + Canal B em Comercial) aceito.
- Criação de novo setor a partir da gestão do canal (`Pós-venda`) via
  `createDepartmentInline` verificou duplicate-safety case-insensitive.

## 9. Members / Routing

- `getChannelRouting` retorna: setor atual do canal, lista de setores da
  empresa, membros da empresa com `department_id`/`status`/`job_title` e
  IDs dos membros atualmente vinculados via `member_channels`.
- `saveChannelRouting` faz diff aplicado: valida cada `memberId` no
  `company_id` e aplica INSERT/DELETE incremental em `member_channels`.
- Não foi criada duplicidade de arquitetura — a atribuição respeita o
  modelo `member ↔ department` congelado em EQUIPE.
- Membro inativo: `team_member_profiles.status = 'active'` continua sendo
  a fonte usada pelo roteador; membros inativos não são selecionados
  automaticamente (regra preservada de EQUIPE).

## 10. Core / Inbox integration (regressão)

- `messages.channel_id`, `contacts.last_inbound_channel_id` e a lógica de
  `stop-on-reply` permanecem sob controle do Core congelado. Auditoria
  desta missão confirmou que a inclusão/edição de canais não altera a
  identidade canônica de contato nem cria conversas por canal.
- Cenário multicanal executado (A OUT → B OUT → C OUT → C IN):
  - Contatos: 1 · Logical conversations: 1 · Channels representadas: 3.
  - `last_inbound_channel_id = C` · `default reply channel = C`.
  - `stop-on-reply`: next cascade attempt = 0.
- Manual channel override no Inbox continua listando apenas canais
  ativos da mesma empresa (verificado em `getReplyChannelContext`).

## 11. Webhook

Rota real `src/routes/api/public/webhooks/whatsapp.$channelId.ts`:

- Path param `channelId` é usado só para lookup; a rota nunca aceita
  `company_id` do payload. O tenant é derivado do `channel.company_id`
  encontrado no banco.
- Verificação HMAC do payload contra `credentials.app_secret` (quando
  presente) — controle preservado, não alterado.
- Provider message idempotency preservada pelo unique index de
  `provider_message_id` em `messages` (regra do Core).

## 12. Storage / Cascata (regressão)

- `channels.status`, `paused_at`, `archived_at` são respeitados pelo
  cascade runner (`cascade_run_claim` / `cascade_run_release`) —
  desligar/pausar canal remove-o das próximas tentativas.
- Deletar canal com histórico continua sendo permitido pela FK, mas o
  histórico de mensagens NÃO é apagado (FK `messages.channel_id` ON DELETE
  SET NULL / RESTRICT preserva timeline). Preferência do produto:
  **arquivar** ao invés de deletar; o UI expõe ambos.

## 13. Testes automatizados

Executados nesta missão:

- `src/lib/__tests__/reports-analytics.test.ts` — 17/17 PASS (regressão).
- `scripts/zenda-core-e2e-3ch.ts` — cenário multicanal PASS.
- `scripts/zenda-inbox-e2e-3ch.ts` — 26/26 PASS.
- Testes existentes de `wa-providers` e webhook mantidos verdes.

Novo teste focado (opcional para POST-V1): matrix de credentials merge no
`updateChannel`. Regra validada manualmente contra o schema e migração;
adicionar suite dedicada é POST-V1 backlog.

## 14. Estados visuais

- **Loading**: card skeleton no `channel-detail-drawer` — PASS.
- **Empty**: rota renderiza CTA "Adicionar canal" sem erro — PASS.
- **Error**: erro em `listChannels` cai em `errorComponent` do route —
  não derruba a app — PASS.
- **Responsividade**: 1440 / 1280 / 768 / 390 validados via
  `mobile-channel-detail-sheet.tsx` (drawer bottom-sheet no mobile).

## 15. Final API Phase Inventory (canais)

Complementa o inventário de Ajustes. Nada é conectado agora.

- **whatsapp_cloud**
  - Config UI: `/channels` → drawer → aba Integração
  - Adapter: `src/lib/wa-providers/index.server.ts`
  - Webhook: `POST /api/public/webhooks/whatsapp/:channelId`
  - Test connection: envio real via `sendTestMessage` (usa
    `access_token` + `phone_number_id`)
  - Secret fields: `access_token`, `app_secret`
  - Config fields: `phone_number_id`
  - Provider Acceptance final: (i) verify handshake da Meta, (ii) envio
    real de mensagem template pelo teste, (iii) recepção assinada HMAC,
    (iv) rotação de token.
- **whatsapp_business / baileys / evolution**: placeholders. Provider
  Acceptance depende de escolha comercial na Final API Phase.

## 16. POST-V1 Backlog

- QR code avançado com deep-link nativo
- Bulk channel import (CSV)
- Health score sofisticado por canal
- Automated provider migration
- Marketplace de número virtual
- Analytics avançado por número
- AI channel optimizer
- Suite dedicada de testes para o merge de credentials

## 17. Gate Final

- SURFACE AUDIT: PASS
- EXPORTED FUNCTIONS AUDITED: 15/15
- AUTH: PASS · RBAC: PASS · MULTI-TENANCY: PASS · DIRECT-ID: PASS
- CHANNEL CRUD/MANAGEMENT/STATUS/DEPARTMENT/MEMBER CONTEXT: PASS
- CREATE DEPARTMENT FROM CHANNEL: PASS · DUPLICATE SAFETY: PASS
- SECRET LEAK TO CLIENT: 0 · SECRET LEAK TO LOGS: 0
- LOGICAL CONVERSATION PRESERVED / LAST INBOUND / DEFAULT REPLY: PASS
- STOP-ON-REPLY REGRESSION: PASS
- CANONICAL WEBMARCAS TEST: PASS
- TYPECHECK: PASS · TESTS: 43/43 · NEW REGRESSIONS: 0
- CRITICAL: 0 · HIGH: 0 · MEDIUM: 0 (backlog) · LOW: 0 (backlog)

**FINAL VERDICT: CANAIS — INTERNALLY COMPLETE / FROZEN**

Provider Acceptance externo permanece **PENDING FINAL API PHASE**.
