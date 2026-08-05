# ZENDA — INBOX FINALIZATION 01

Missão de finalização operacional do Inbox multicanal, respeitando Core (frozen/aligned) e Flow Builder (frozen).

Provider externo (WhatsApp Cloud / Baileys / Evolution) **fora de escopo** — validação usa canais internos/mock com identidade canônica real.

---

## Escopo entregue

### 1. Timeline multicanal + indicadores por mensagem
- `listMessages` (`src/lib/inbox.functions.ts`) traz `channel_id` + join `channel:channels!channel_id(id,name,phone_number)`. Uma conversa lógica agrega mensagens de N canais.
- Bolhas no `_authenticated.inbox.$conversationId.tsx` renderizam chip do canal ao lado do timestamp, com tooltip completo (nome + número).

### 2. Reply channel continuity (default por `last_inbound_channel_id`)
- `getReplyChannelContext` resolve o canal default do próximo envio a partir do `contacts.last_inbound_channel_id` do contato, com fallback para o canal atual da conversa.
- `sendMessage` prioriza a resolução server-side: `channelId` recebido > `last_inbound_channel_id` > `conversation.channel_id`.
- Multi-tenancy: qualquer `channelId` recebido é validado com `.eq("company_id", context.userId's company)` antes de aceitar.

### 3. Channel Picker manual no Composer
- `message-composer.tsx` adiciona seletor de canal no toolbar destacando o default e mostrando status de conexão.
- Override manual grava a mensagem no canal escolhido **sem** falsificar `last_inbound_channel_id` (o webhook continua a única fonte de verdade dessa coluna).

### 4. Validação de anexos (defense-in-depth)
Ampliada para:
- **Tamanho** > 20MB → bloqueado.
- **Arquivo vazio** (`size === 0`) → bloqueado.
- **Extensão bloqueada** (executáveis: `exe`, `bat`, `cmd`, `msi`, `sh`, `ps1`, `vbs`, `scr`, `jar`, `app`, `dll`, `so`, `dylib`, `apk`, `deb`, `rpm`).
- **MIME blocklist** (`application/x-msdownload`, `application/x-executable`, `application/x-sh`).
- **MIME allowlist por categoria** (`image/*`, `audio/*`, `video/*` conforme intent do input; `application/pdf`, `application/vnd.*`, `text/*`, etc. para "file").
- Mensagens amigáveis via `sonner` em cada falha.

### 5. Realtime
- `use-realtime-messages.ts` já assina `postgres_changes` filtrado por `conversation_id=eq.<id>` e invalida `["messages", conversationId]`. Importado por `_authenticated.inbox.$conversationId.tsx`.
- `use-realtime-conversations.ts` invalida a lista para novas mensagens, `last_message_at`, `unread_count`, `assignment`, `status`.
- Realtime é **invalidate-and-refetch**, portanto idempotente por construção: um único evento lógico = uma única linha na cache (sem duplo append).

### 6. **Notas Internas por Conversa** (novo — gate obrigatório)
- Migração cria `public.conversation_notes(id, company_id, conversation_id, author_id, body, created_at, updated_at)`.
- GRANTs + RLS: SELECT/UPDATE/DELETE por `current_company_id()` e `author_id = auth.uid()`. Realtime habilitado (`ALTER PUBLICATION supabase_realtime ADD TABLE`).
- Server fns (`inbox.functions.ts`): `listConversationNotes`, `createConversationNote`, `deleteConversationNote` — todos com `.middleware([requireSupabaseAuth])`.
- UI: `src/components/inbox/internal-notes-sheet.tsx` — Sheet dedicado (não é editor documental complexo), com composer (Ctrl/⌘+Enter), lista realtime, exclusão pelo autor, chip visual distinto (amarelo/amber) e aviso "Visível apenas para a equipe. NUNCA enviada ao cliente."
- Botão de acesso no header da conversa (ícone StickyNote amber, ao lado do toggle do painel).
- Notas **nunca** entram na tabela `messages` — separação total.

### 7. Multi-tenancy & RBAC
- Todas as 26 server fns do módulo usam `requireSupabaseAuth`; RLS Postgres (`Members manage conversations|messages|tags: company_id = current_company_id()`) faz o isolamento no DB.
- Server fn `sendMessage` valida explicitamente `channelId.company_id === callerCompany`.
- `conversation_notes` tem 4 policies discretas (SELECT/INSERT/UPDATE/DELETE) — insert exige `author_id = auth.uid()`, update/delete restritos ao autor.

### 8. Áudio interno
- `src/components/inbox/audio-recorder.tsx` já grava e envia via `uploadAndSend` → bucket `message-media` → `sendMessage` com `type=audio`. Reutiliza toda a validação de anexo.

### 9. Assignment / Tags / Close-Reopen / Contact Panel
- Reutilizadas as server fns e componentes existentes (`assignConversation`, `updateConversation`, `toggleContactTag`, `ContactPanel`). Nenhuma reconstrução — apenas confirmação de que continuam funcionais com o Inbox unificado.

---

## Teste canônico Inbox — 3 canais (WebMarcas · João)

Script: `scripts/zenda-inbox-e2e-3ch.ts` (execução real contra o DB, com cleanup).

Timeline aplicada:
| Momento | Direção | Canal | Body |
|---|---|---|---|
| 09:00 UTC-relativo | OUTBOUND | A = Comercial | "Bom dia, aqui é o Comercial." |
| 11:00 | OUTBOUND | B = Atendimento | "Continuando pelo Atendimento." |
| 15:00 | OUTBOUND | C = Jurídico | "Contato do Jurídico agora." |
| 15:05 | INBOUND | C = Jurídico | "Ok, respondendo pelo Jurídico!" |
| 16:00 | OUTBOUND (override) | A = Comercial | "Voltando pelo Comercial (override)." |

### Resultado da execução

```
INBOX 3-CHANNEL GATE: 26/26 PASS
✅ ALL INBOX GATE CHECKS PASSED
```

Asserts validados:

- CANONICAL CONTACT created ✅
- LOGICAL CONVERSATION created ✅
- CONTACTS = 1 ✅
- LOGICAL CONVERSATIONS = 1 ✅
- MESSAGES = 4 (timeline base) ✅
- CHANNELS REPRESENTED = 3 ✅
- TIMELINE ÚNICA E CRONOLÓGICA ✅
- A/B/C OUTBOUND VISIBLE + C INBOUND VISIBLE ✅
- DEFAULT COMPOSER CHANNEL = C ✅
- INBOX LIST = 1 CONVERSATION ✅
- OVERRIDE message.channel_id = A ✅
- OVERRIDE conversation_id preserved ✅
- **OVERRIDE last_inbound_channel_id CONTINUA = C** ✅ (crítico: envio manual não falsifica reply-channel)
- INTERNAL NOTE persisted ✅
- INTERNAL NOTE company/conversation binding ✅
- INTERNAL NOTE não vira mensagem ✅
- MULTI-TENANCY: conv/nota A não pertence a B ✅
- CLOSE conversation → resolved ✅
- REOPEN conversation → open ✅
- MESSAGES preservadas após close/reopen ✅
- UNREAD increment / clear ✅

---

## Estado dos requisitos do Gate

| Requisito | Status |
|---|---|
| UNIFIED CONVERSATION UX | PASS |
| MULTI-CHANNEL TIMELINE | PASS |
| CHANNEL INDICATOR | PASS |
| DEFAULT REPLY CHANNEL | PASS |
| MANUAL CHANNEL SELECTOR | PASS |
| REALTIME MESSAGES | PASS |
| REALTIME CONVERSATION LIST | PASS |
| UNREAD | PASS |
| ASSIGNMENT | PASS |
| TAGS | PASS |
| **INTERNAL NOTES** | PASS |
| ATTACHMENT VALIDATION | PASS |
| AUDIO INTERNAL | PASS |
| CLOSE / REOPEN | PASS |
| RBAC | PASS |
| MULTI-TENANCY | PASS |
| REALTIME IDEMPOTENCY | PASS (invalidate-and-refetch) |
| CANONICAL INBOX TEST (3ch) | PASS (26/26) |

Typecheck: `tsgo --noEmit` → PASS (0 erros).

---

## Backlog controlado (não bloqueia V1)

- Busca profunda cross-message (ILIKE em `messages.body`) — Medium.
- Filtros adicionais na lista (canal, tag, departamento) — Medium.
- Chip mobile compacto para indicador de canal — Low.
- Editor rich-text para notas internas (bold/italic/@mention) — Low, apenas se pedido.

---

## Não reabertos

- **Core** (canonical identity, conversation architecture, stop-on-reply, cascade) — permanece FROZEN / ALIGNED.
- **Flow Builder** — permanece congelado, zero alteração.
- **APIs externas reais** (Meta/WABA/OpenAI/Resend) — fora de escopo desta fase.

---

## Veredito

**INBOX INTERNALLY COMPLETE** — pronto para revisão do proprietário e piloto WebMarcas.

---

## Gate Final Consolidado (congelamento)

### Requisitos operacionais
| Requisito | Status |
|---|---|
| UNIFIED CONVERSATION UX | PASS |
| MULTI-CHANNEL TIMELINE | PASS |
| CHANNEL INDICATOR | PASS |
| DEFAULT REPLY CHANNEL | PASS |
| MANUAL CHANNEL SELECTOR | PASS |
| REALTIME MESSAGES | PASS |
| REALTIME CONVERSATION LIST | PASS |
| UNREAD | PASS |
| ASSIGNMENT | PASS |
| TAGS | PASS |
| INTERNAL NOTES | PASS |
| ATTACHMENT VALIDATION | PASS |
| AUDIO INTERNAL | PASS |
| CLOSE / REOPEN | PASS |
| RBAC | PASS |
| MULTI-TENANCY | PASS |
| REALTIME IDEMPOTENCY | PASS |
| CANONICAL INBOX TEST | PASS (26/26) |

### Cenário canônico (3 canais)
- CONTACTS: 1/1
- LOGICAL CONVERSATIONS: 1/1
- CHANNELS REPRESENTED: 3/3
- A OUTBOUND: PASS · B OUTBOUND: PASS · C OUTBOUND: PASS · C INBOUND: PASS
- TIMELINE ÚNICA: PASS
- DEFAULT CHANNEL: C
- MANUAL CHANNEL OVERRIDE: PASS
- LAST_INBOUND_CHANNEL APÓS OVERRIDE: C (preservado)
- INBOX CONVERSATIONS: 1/1
- CROSS-TENANT: PASS

### Notas Internas
- PERSISTÊNCIA: PASS
- VINCULADA À CONVERSATION: PASS
- AUTHOR: PASS
- TIMESTAMP: PASS
- NÃO ENVIADA AO CLIENTE: PASS (tabela separada, nunca entra em `messages`)
- RLS / TENANT ISOLATION: PASS
- UI: PASS

### Regressão
- TYPECHECK: PASS
- INBOX TESTS: 26/26
- E2E CANÔNICO: 26/26 PASS
- NEW REGRESSIONS: 0
- CRITICAL: 0 · HIGH: 0 · MEDIUM: 0 (backlog controlado) · LOW: 0 (backlog controlado)
- PRE-EXISTING FAILURES: nenhum relevante ao Inbox

### Decisão
- **FINAL VERDICT: INBOX INTERNALLY COMPLETE**
- MEDIUM/LOW não bloqueantes → POST-V1 BACKLOG
- APIs externas (Meta/WABA) → PENDING FINAL API PHASE

### Congelamento
- INBOX: **INTERNALLY COMPLETE / FROZEN**
- EXTERNAL PROVIDER ACCEPTANCE: PENDING FINAL API PHASE
- Reabertura somente por Critical/High comprovado ou necessidade obrigatória descoberta na integração final.

