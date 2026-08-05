# Auditoria Arquitetural — Zenda (WhatsApp Multi-Tenant Platform)
Modo: READ-ONLY. Nenhum arquivo foi alterado, nenhuma migration executada.

## 1. Executive Summary

O Zenda entrega hoje uma base técnica sólida em pontos isolados — RLS multi-tenant consistente, idempotência de mensagens inbound, um `flow_runs` bem desenhado com locks/idempotency_key/estado — mas **falha nos dois pilares centrais do objetivo de negócio**: (a) o modelo de conversa é **por canal**, não unificado por contato, e (b) o motor de cascata **não é interrompido quando o cliente responde** em nenhum canal. Não existe nenhuma linha de código que ligue o webhook de entrada ao cancelamento de `cascade_runs`. O motor de cascata, além disso, roda em um cron sem lock/idempotência, com risco real de duplicação de envios. O resultado é uma plataforma de inbox multicanal competente, mas que **não implementa "ONE logical conversation" nem "STOP-ON-REPLY"**, que são os dois requisitos definidores do produto conforme o prompt original.

## 2. Objetivo original

> Multiple WhatsApp numbers per company, ONE canonical contact, ONE logical conversation, cascading re-engagement across channels, STOP-ON-REPLY when the client answers in any channel, reply continuity on the answering channel.

## 3. Arquitetura atual encontrada

- TanStack Start (file-based routes + server functions) sobre Supabase (Postgres + RLS + Realtime).
- `channels` (N por empresa, com `provider_type`, `credentials`, `department_id`) → `conversations` (FK company/contact/channel) → `messages`.
- Cascata implementada como tabela de política (`cascade_policies.steps` jsonb) + `cascade_runs` (estado por execução) + `cascade_attempts` (log de tentativas), avançada por um cron público (`/api/public/cron/cascade-tick`).
- Flow Builder (`flow_runs`) é um motor **separado e mais maduro** (lock_token, idempotency_key, execution_stack, dead-letter) que convive com o motor de cascata mais simples.
- Webhook WhatsApp Cloud (`whatsapp.$channelId.ts`) é o único ponto de entrada real de mensagens; o outro webhook (`whatsapp-webhook.ts`) apenas grava `channel_events`, não cria mensagens/conversas (é vestigial/legado).

## 4. Mapa dos módulos

| Módulo | Arquivo(s) | Papel | Estado |
|---|---|---|---|
| Contacts | `contacts` table | Identidade canônica | Parcial (sem normalização de telefone) |
| Conversations | `conversations` table, `inbox.functions.ts` | Unidade de conversa | Por canal, não unificada |
| Messages | `messages` table | Histórico | OK, idempotente |
| Channels | `channels.functions.ts`, `channels` table | Multi-número | OK |
| Cascade | `cascade.functions.ts`, `cascade-tick.ts` | Reengajamento | Sem lock, sem stop-on-reply |
| Flow Runtime | `flow-executor.server.ts`, `flow-resume-inbound.server.ts` | Automação conversacional | Maduro, mas desacoplado de cascade |
| Inbox | `inbox.functions.ts`, `src/components/inbox` | Lista de conversas | Lista por conversation_id (=por canal) |
| CRM | `_authenticated.crm.$contactId.tsx` | Visão 360 do contato | Agrega conversas por contact_id (ok), mas não fecha o loop de stop-on-reply |
| Webhook | `whatsapp.$channelId.ts` | Pipeline inbound | Dedup ok, sem hook para cascade |

## 5. Contact Identity

- `contacts`: `idx_contacts_company_phone_active` **UNIQUE (company_id, phone) WHERE deleted_at IS NULL AND phone IS NOT NULL** — dedup existe e é tenant-aware.
- Evidência: consulta `\d contacts`.
- **Problema**: não há função de normalização E.164 em nenhum ponto do código (`grep normalizePhone|E.164` só retorna um comentário de tipo, não implementação). O webhook faz apenas `msg.from_phone.startsWith("+") ? ... : "+"+...` (whatsapp.$channelId.ts:94) — não trata espaços, zeros à esquerda, DDI variável, etc. Dois formatos diferentes do mesmo número (`+5511999998888` vs `5511999998888` vs com hífen) criam contatos duplicados, pois o índice único é uma comparação de string exata.
- **Veredito**: PARTIAL.

## 6. Conversation Unification

- Schema `conversations`: colunas `company_id, contact_id, channel_id, status...`. **Não há nenhuma constraint UNIQUE em (contact_id, channel_id) nem em contact_id sozinho** (evidência: `pg_constraint`/`\d conversations` só lista FKs, PK e nenhuma UNIQUE).
- O webhook busca conversa por `company_id + channel_id + contact_id + status≠resolved` (whatsapp.$channelId.ts:125-134), ou seja, **explicitamente escopado por canal**. Isso significa: se João escreve pelo número A e depois pelo número B da mesma empresa, são criadas **duas conversas distintas**, cada uma com seu próprio `id`, histórico e `unread_count`.
- **Isso é o oposto do requisito "ONE logical conversation"**.
- **Veredito**: FAIL. (R02)

## 7. Multi-channel History

- Como não existe conversa unificada, o "histórico multicanal" só existe de forma indireta: a CRM (`_authenticated.crm.$contactId.tsx:120,124`) busca todas as conversas por `contact_id`, então tecnicamente é possível ver múltiplas conversas do mesmo contato — mas são views separadas, não um timeline único intercalado por canal.
- `contact-timeline.tsx` existe e mistura eventos, mas não foi verificado se une mensagens de conversas diferentes num único fio cronológico (não teria como sem quebrar o modelo por-thread).
- **Veredito**: PARTIAL — dado existe fragmentado, mas não como "uma conversa lógica".

## 8. Channels

- `channels` suporta múltiplos números por empresa (`company_id` FK, sem unique em phone_number), `provider_type` enum, `credentials` jsonb, `department_id` para roteamento (CHANNEL-ROUTING-01), `routing_strategy`, `daily_message_limit`.
- **Veredito**: PASS (R04/R16).

## 9. Cascade/Reengagement Engine

- `cascade_policies.steps` jsonb array de `{channel_type, wait_minutes, message, subject}` — suporta múltiplos canais por step (whatsapp/email/sms) — atende ao requisito conceitual de "cascading across channels".
- **Porém**: passo whatsapp usa `run.conversation_id` fixo (cascade.functions.ts:312-345) — não escolhe dinamicamente "o canal certo" nem cria conversa se não houver uma; se `conversation_id` for null, o step é `skipped`. Ou seja, a cascata **depende de uma conversa pré-existente vinculada no momento do `startCascadeRun`**, sem lógica de qual canal (dos N da empresa) deve ser usado no reengajamento.
- SMS não implementado (`status = "skipped"` hard-coded, cascade.functions.ts:346-349).
- **Veredito**: PARTIAL (R09).

## 10. Stop-on-Reply

- Busca exaustiva: `grep -rn "cascade" src/routes/api/public/` e nos handlers de webhook não retorna NENHUMA referência a `cascade_runs`, `cancelCascadeRun` fora do próprio módulo cascade.
- O webhook chama `resumeWaitingReplyForConversation` (flow_runs) mas **nunca** consulta/cancela `cascade_runs` do mesmo `contact_id`.
- Consequência prática: se uma cascata está "running" para um contato e ele responde em QUALQUER canal, a cascata **continua executando e mandará a próxima mensagem de reengajamento mesmo após a resposta** — comportamento diretamente contrário ao requisito STOP-ON-REPLY.
- **Veredito**: FAIL crítico (R10).

## 11. Race Safety

- `cascade_runs`/`cascade_attempts`: nenhuma coluna `lock_token`/`lock_expires_at`/`idempotency_key` (compare com `flow_runs` que tem todas as três).
- `cascade-tick.ts:16-21` seleciona até 50 runs `due` e itera chamando `_executeCascadeStep` sequencialmente **sem** `SELECT ... FOR UPDATE SKIP LOCKED`, sem CAS (compare-and-swap) de status antes de processar.
- Se o cron for invocado duas vezes em paralelo (ex.: retry de infra, múltiplas instâncias), o mesmo `run_id` pode ser processado duas vezes, gerando `cascade_attempts` e mensagens duplicadas para o cliente — sem constraint única em `cascade_attempts(run_id, step_index)` (existe índice não-único: `cascade_attempts_run_idx`).
- **Veredito**: FAIL (R11).

## 12. Reply Channel Continuity

- Nenhuma coluna como `last_inbound_channel_id`, `active_channel_id`, `preferred_channel_id` em `contacts` ou `conversations` (grep vazio).
- A "continuidade de resposta no canal que respondeu" não pode ser implementada hoje porque o sistema nem sabe, no nível do contato, qual foi o último canal usado — essa informação só existe implicitamente como "qual conversation_id recebeu a última mensagem", presa ao modelo fragmentado por canal.
- **Veredito**: FAIL (R12).

## 13. Unified Inbox

- `inbox.functions.ts:22-24`: lista `conversations` uma linha por `conversation`, cada uma com seu próprio `channel_id` — **não** agrupado por `contact_id`. Um contato com 3 canais ativos aparece como 3 itens separados na lista de inbox.
- **Veredito**: FAIL quanto a "visão única por contato" (R13), embora funcione bem como inbox por-thread convencional (estilo caixa de entrada por canal).

## 14. CRM

- `_authenticated.crm.$contactId.tsx` mostra 1 contato com metadados agregados (deals, tags, tasks) e lista conversas relacionadas via `contact_id` (linhas 92-124) — aqui sim há uma visão agregada do "João através de N canais", mas apenas como lista de conversas, sem timeline mesclado nem indicação de canal ativo/preferido.
- **Veredito**: PARTIAL (R14).

## 15. Flow Builder alignment

- `flow_runs` é tecnicamente superior ao módulo de cascata (lock/idempotency/execution_stack/dead-letter/version pinning). É o motor certo para orquestração robusta, mas está desacoplado de `cascade_runs` — dois sistemas paralelos de "reengajamento/automação" sem governança comum.
- Recomenda-se (fora do escopo desta auditoria apenas apontar): unificar cascade sobre a engine de flow_runs em vez de manter um segundo executor mais frágil.

## 16. Campaign alignment

- `broadcasts`/`broadcast_recipients` referenciam `contact_id` diretamente (FK contacts), não conversation — bom, evita duplicar conversas por campanha. Mas como `channel_id` de broadcast é livre (`broadcasts_channel_id_fkey` ON DELETE SET NULL), campanhas disparadas por múltiplos canais para o mesmo contato criarão múltiplas `conversations` novas (uma por canal), agravando a fragmentação do R02.
- **Veredito**: RISCO MÉDIO-ALTO de duplicação de conversas via campanha (R12 mencionado no prompt).

## 17. Inbound pipeline

Fluxo real (whatsapp.$channelId.ts):
1. Verifica assinatura HMAC (bom, R — segurança) — linhas 56-73.
2. `normalizeMetaWebhook` → normaliza payload Meta.
3. Upsert contato por `(company_id, phone)` exato (sem normalização de formato) — linhas 97-122.
4. Match de conversa por `(company_id, channel_id, contact_id, status≠resolved)` — **por canal** — linhas 125-134.
5. Dedup de mensagem por `(conversation_id, provider_message_id)` — linhas 160-166.
6. Insert mensagem, update preview/unread — linhas 191-211.
7. `resumeWaitingReplyForConversation` (flow_runs) — linha 219.
8. Se não houve flow resume, dispara IA se `assigned_type='ai_agent'` — linha 247+.
9. **Nunca** consulta/cancela `cascade_runs`.
- **Veredito**: pipeline funcional para inbound single-channel, mas incompleto frente ao objetivo (falta passo de cascade-stop).

## 18. Idempotency

- Mensagens: `messages_channel_provider_msg_idx` UNIQUE(conversation_id, provider_message_id) WHERE provider_message_id IS NOT NULL — PASS.
- `flow_runs`: `flow_runs_idempotency_key_uidx` UNIQUE(company_id, idempotency_key) — PASS.
- `cascade_runs`/`cascade_attempts`: SEM idempotency key — FAIL.
- Webhook `whatsapp-webhook.ts` (legado) dedup por `payload @> {message_id}` via `.contains` — funcional mas não indexado por GIN confirmado (risco de scan lento em volume alto; não crítico pois parece não estar em uso ativo).

## 19. Organizational Routing

- `channels.department_id` FK → `departments`; `idx_channels_department`. Confirma que CHANNEL-ROUTING-01 (canal→departamento) está de fato implementado no schema. Não foi re-auditado o fluxo de equipe/team routing em profundidade (fora do escopo pedido — "já entregue").
- **Veredito**: PASS.

## 20. Multi-tenancy

- RLS ativo com `USING (company_id = current_company_id())` em `contacts`, `conversations`, `messages`, `channels`, `cascade_policies`, `cascade_runs`, `cascade_attempts`, `flow_runs` — confirmado via `\d` em todas.
- **Veredito**: PASS forte (R17/R20).

## 21. RBAC

- `grep -rn has_permission src/lib` retorna apenas 2 ocorrências em todo `src/lib` — uso muito esparso fora do módulo rbac em si. Nenhuma chamada a `has_permission` dentro de `cascade.functions.ts` ou `inbox.functions.ts`: qualquer usuário autenticado da empresa pode criar/cancelar cascatas e políticas (a policy RLS só verifica `company_id`, não papel/permissão).
- `channels` tem policy mais granular: `has_role(auth.uid(),'admin')` para gerenciar canais — bom exemplo pontual, mas não replicado em cascade.
- **Veredito**: PARTIAL/FAIL para superfícies sensíveis de cascata (R18/R21).

## 22. Observability

- `domain_events`, `team_audit_log`, `channel_events` existem como tabelas. Cascade grava em `channel_events` (`cascade_started`, `cascade_step_sent`, `cascade_completed`, `cascade_cancelled`) — bom nível de trilha.
- **Não há `correlation_id`** propagado entre webhook → cascade → flow_runs — cada evento é isolado, dificultando rastrear uma jornada ponta-a-ponta de um contato.
- **Veredito**: PARTIAL (R19).

## 23. Analytics readiness

- `channel_metrics_daily` existe e é alimentado por trigger (`bump_channel_metrics_trg AFTER INSERT ON messages`) — pronto para métricas por canal.
- Não há métricas equivalentes para cascata (taxa de stop-on-reply, taxa de conversão por step) — porque o próprio conceito não está implementado.
- **Veredito**: PARTIAL.

## 24. Scalability

- Índices em hot paths presentes: `idx_messages_conversation_created`, `idx_conversations_company` (com `last_message_at DESC`), `cascade_runs_due_idx (status, run_at)` — bons.
- Falta índice composto `contacts(company_id, phone)` para lookups sem normalização (existe via unique parcial, ok).
- Cron cascade processa `LIMIT 50` sequencialmente sem paralelismo/lock — não escala além de baixo volume; em alta escala, vira gargalo e fonte de duplicidade (ver §11).

## 25. Matriz R01–R22

| ID | Requisito | Status | Evidência | Risco |
|---|---|---|---|---|
| R01 | Contact identity/dedup | PARTIAL | `idx_contacts_company_phone_active`; sem normalização E.164 | Médio |
| R02 | Conversa unificada por contato | **FAIL** | `conversations` sem UNIQUE(contact_id,channel_id); webhook filtra por channel_id (whatsapp.$channelId.ts:125-134) | Crítico |
| R03 | Multi-channel history no contato | PARTIAL | CRM lista conversas por contact_id, não unificado | Alto |
| R04 | Múltiplos números por empresa | PASS | `channels.company_id` sem unicidade de phone | — |
| R05 | Roteamento por canal | PASS | `channels.department_id`, `routing_strategy` | — |
| R06 | Mensagens rastreáveis (channel/direction/provider_id) | PARTIAL | `messages` não tem `channel_id` direto (só via conversation_id→channel_id); tem `direction`, `provider_message_id` | Médio |
| R07 | Cascata multi-step multi-canal | PARTIAL | `cascade_policies.steps` suporta 3 canais, mas SMS não implementado | Médio |
| R08 | Cascata escolhe canal dinamicamente | FAIL | Depende de `conversation_id` fixo passado no start | Alto |
| R09 | Cascata robusta (motor) | PARTIAL | Existe, mas mais simples que flow_runs | Médio |
| R10 | STOP-ON-REPLY | **FAIL** | Nenhuma referência cruzada webhook↔cascade_runs | Crítico |
| R11 | Race safety/locks/idempotência cascade | **FAIL** | Sem lock_token/idempotency_key em cascade_runs; cron sem SKIP LOCKED | Crítico |
| R12 | Continuidade de canal de resposta | FAIL | Sem `last_inbound_channel_id`/similar | Alto |
| R13 | Inbox unificado por contato | FAIL | `inbox.functions.ts` lista por conversation (por canal) | Alto |
| R14 | CRM visão 360 | PARTIAL | Lista conversas por contato, sem timeline mesclado | Médio |
| R15 | Flow Builder alinhado | PARTIAL | Motor maduro mas desacoplado de cascade | Médio |
| R16 | Campanhas sem duplicar contato/conversa | PARTIAL | Contato ok (FK direta); conversa duplica por canal | Médio |
| R17 | Pipeline inbound completo | PARTIAL | Falta stop cascade no fluxo | Alto |
| R18 | Idempotência webhook (provider_message_id) | PASS | UNIQUE(conversation_id, provider_message_id) | — |
| R19 | Rastreabilidade outbound (run_id/campaign_id em messages) | FAIL | `messages` não tem colunas cascade_run_id/flow_run_id/campaign_id | Alto |
| R20 | Multi-tenancy RLS | PASS | policies `company_id = current_company_id()` em todas tabelas-chave | — |
| R21 | RBAC em funções sensíveis | PARTIAL/FAIL | Só 2 usos de has_permission em src/lib; cascade sem checagem de papel | Alto |
| R22 | Observabilidade (eventos/correlação) | PARTIAL | channel_events rico, sem correlation_id cross-domínio | Médio |

## 26. Simulação conceitual — WebMarcas (cliente com 3 números WhatsApp)

1. João escreve para o número Vendas (Canal A) → contato criado, `conversations` row #1 (channel=A). ✅ funciona.
2. Cascata de reengajamento é iniciada para João vinculada à conversation #1 (Canal A) porque foi passada explicitamente no `startCascadeRun`. ✅ funciona no criação.
3. João, sem responder no Canal A, manda mensagem para o número Suporte (Canal B) da mesma empresa.
4. Webhook cria **nova** `conversations` row #2 (channel=B) para o **mesmo contact_id** — **quebra aqui**: já não existe "ONE logical conversation" (R02 FAIL).
5. `resumeWaitingReplyForConversation` só olha `conversation_id` (B) — não teria como "retomar" um flow pausado na conversation A mesmo que devesse.
6. **A cascata rodando (vinculada à conversation A) não é cancelada** — cron `cascade-tick` continua e, na próxima janela, envia a próxima etapa de reengajamento pelo Canal A, **mesmo que João já tenha respondido no Canal B**. Isso é uma violação direta e concreta de STOP-ON-REPLY (R10 FAIL confirma o cenário).
7. Se dois disparos do cron ocorrerem quase simultâneos (retry de plataforma), a mesma `cascade_runs.id` pode ser processada 2x, mandando a mesma mensagem de reengajamento duas vezes ao João (R11 FAIL).
8. Na Inbox, o atendente vê duas conversas separadas ("João - Vendas" e "João - Suporte") sem indicação cruzada de que é a mesma pessoa que acabou de responder em outro canal (R13 FAIL).
9. No CRM, o atendente que abrir o perfil de João verá as duas conversas listadas (parcialmente OK), mas nada indica qual é o "canal ativo" para continuar a conversa (R12 FAIL).
10. **Conclusão da simulação**: a cadeia quebra já no passo 4 (duplicação de conversa) e se agrava decisivamente no passo 6 (cascata não para). O objetivo de negócio original **não é atendido** neste cenário multi-canal, que é exatamente o caso de uso central do produto.

## 27. Gaps

**Critical**
1. GAP: conversas duplicadas por canal em vez de unificadas por contato (R02).
2. GAP: nenhum stop-on-reply cross-channel para cascade_runs (R10).
3. GAP: cascade-tick sem lock/idempotência — risco de duplicar envios reais ao cliente (R11).
4. GAP: nenhuma rastreabilidade outbound (cascade_run_id/flow_run_id/campaign_id em `messages`) — impossível auditar de onde veio uma mensagem enviada (R19).

**High**
5. Inbox não agrupa por contato (R13).
6. Sem continuidade de canal de resposta (R12).
7. RBAC ausente nas funções de cascade (qualquer membro pode iniciar/cancelar) (R21).
8. Cascata não escolhe canal dinamicamente, depende de conversation_id fixo no start (R08).
9. Campanhas podem multiplicar conversas por canal (R16).

**Medium**
10. Falta normalização E.164 de telefone (R01).
11. SMS no cascade não implementado, apenas placeholder (R07).
12. Timeline CRM não mescla mensagens de conversas diferentes (R03/R14).
13. Correlation_id ausente entre domínios (R22).
14. `messages` não tem `channel_id` direto (requer join via conversation) — perf/legibilidade.
15. Webhook legado `whatsapp-webhook.ts` parece morto/mal integrado (não cria mensagens).

**Low**
16. Dedup do webhook legado via `.contains` jsonb sem índice GIN confirmado.
17. `cascade_attempts` sem unique(run_id, step_index) para blindar contra duplicidade mesmo com lock futuro.
18. Falta métricas de cascata em analytics.
19. Cron cascade sem paralelismo/particionamento para escala futura.

## 28. Must Have / Should Have / Pós-V1

**Must Have (bloqueiam o objetivo original)**
- Unificar modelo de conversa por contato (ou introduzir um agregador "thread lógica" acima de conversations por canal) — R02.
- Implementar stop-on-reply: no inbound webhook, ao inserir mensagem, buscar `cascade_runs` ativos (`status='running'`) por `contact_id` (não por conversation) e cancelá-los/pausá-los.
- Adicionar lock/idempotência ao cascade-tick (lock_token + FOR UPDATE SKIP LOCKED, análogo ao flow_runs).
- Adicionar `cascade_run_id`/`flow_run_id`/`campaign_id` em `messages` para rastreabilidade outbound.

**Should Have**
- Agrupar Inbox por contato com sub-abas por canal.
- Campo `last_inbound_channel_id` em `contacts`, atualizado a cada inbound, para continuidade de resposta.
- RBAC (`has_permission`) nas funções de cascade.
- Normalização de telefone E.164 centralizada.

**Pós-V1**
- Unificar motor de cascata sobre a engine de flow_runs (locks/versionamento reaproveitados).
- SMS real via Twilio.
- Métricas de cascata em channel_metrics_daily/analytics.
- Correlation_id cross-domínio.

## 29. Caminho mínimo restante

- **GAP-01**: Constraint/lógica de conversa lógica única por contato (nova coluna `logical_thread_id` ou repensar `conversations` para ser por-contato com `channel_id` só na mensagem). Requer migração de dados e mudança na busca do webhook.
- **GAP-02**: Hook de stop-on-reply no webhook: após insert de mensagem inbound, `UPDATE cascade_runs SET status='cancelled' WHERE contact_id=$1 AND status='running'`.
- **GAP-03**: Lock em cascade-tick: adicionar `lock_token`/`lock_expires_at` a `cascade_runs`, usar `UPDATE ... WHERE status='running' AND (lock_expires_at IS NULL OR lock_expires_at<now()) RETURNING id` como claim atômico.
- **GAP-04**: Adicionar `cascade_run_id uuid`, `flow_run_id uuid`, `campaign_id uuid` nullable em `messages` + índices.
- **GAP-05**: `last_inbound_channel_id` em `contacts`, atualizado no webhook.
- **GAP-06**: RBAC em `cascade.functions.ts` (has_permission check antes de start/cancel).

## 30. Scores

- (A) Arquitetural: **42/100** — fundações RLS/idempotência de mensagens boas, mas modelo de dados central (conversation) não suporta o objetivo.
- (B) Funcional interno: **38/100** — cascata e stop-on-reply, que são o diferencial do produto, não funcionam como especificado.
- (C) API readiness: **30/100** — falta de correlação/rastreabilidade outbound e RBAC incompleto tornam a superfície pública/integrável frágil.
- **Overall: 37/100**

## 31. Veredito final

**Opção D — MVP funcional isolado por canal, não atende ao objetivo de negócio original.**

Justificativa: o sistema funciona bem como uma caixa de entrada WhatsApp multicanal com automação de fluxos madura, mas os dois requisitos que definem o produto ("ONE logical conversation" e "STOP-ON-REPLY") estão ausentes na arquitetura de dados e no pipeline, não apenas na UI. Não é um problema de polimento — é uma lacuna estrutural: o schema `conversations` não tem sequer a chave que permitiria unificar por contato, e não existe nenhuma linha de código que conecte o evento de resposta inbound ao motor de cascata. Corrigir isso exige mudança de modelo de dados e de pipeline, não apenas features incrementais.
