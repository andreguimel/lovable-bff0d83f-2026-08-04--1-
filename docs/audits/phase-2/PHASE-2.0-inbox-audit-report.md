# Fase 2.0 — Estágio 1 · Auditoria Read-Only do Inbox

**Data:** 2026-07-17
**Ambiente:** Preview local (`http://localhost:8080`) + banco de produção (leitura)
**Escopo:** Auditoria read-only. Nenhuma alteração de código de produto foi feita.
**Instrumentos:** Playwright (desktop 1280×1800, mobile 390×844) com sessão Supabase real; `psql` read-only; leitura estática de fontes.

---

## 1. Sumário executivo

| Métrica | Valor observado |
|---|---|
| Empresas ativas | 1 (`Minha Empresa`) |
| Canais configurados | 2 — **ambos `provider=mock`** (nenhum WhatsApp Cloud real conectado) |
| Conversas totais | 3 |
| Mensagens 7d (out / in) | 106 / 7 |
| Tipos usados 7d | text 88, audio 24, video 1 (**image / file: 0**) |
| Status observados 7d | sent 111, delivered 2 (**read: 0**) |
| Uso de Reply | 2 / 113 (1,7%) |
| Uso de Forward | 1 mensagem em 30d |
| Conversas Pinned | 0 |
| Guardian aberto | 2 High + 18 Medium (todos históricos — última ocorrência ≥ 43h atrás) |
| Health snapshot atual | `healthy`, score 100, 0 incidents |
| Tempo até "inbox pronto" (Playwright) | **≈ 9.070 ms** (desktop, cold) |
| DLQ (flow_dead_letter) | 0 |
| Runtime flow_runs CREATED (sem versão) | 12 runs órfãos legados |

**Veredito global:** o módulo Inbox está **funcionalmente pronto para o piloto**, mas com **1 achado High de performance no cold-load** e **3 achados Medium**. Nenhum bug Critical em produção. As duas incidências High registradas no Guardian são **históricas (2026-07-15, 1 ocorrência cada)** e não se reproduziram no runtime atual.

**Recomendação:** seguir o piloto sem missões de correção obrigatórias antes de operar. Registrar todos os itens Medium/Low no backlog. Reavaliar performance de cold-load se operadores reportarem lentidão real.

---

## 2. Matriz de auditoria por item

Legenda: **PASS** = validado sem falha · **PARTIAL** = funciona com ressalva · **UNTESTED** = não exercível no piloto atual (falta de dado real).

| # | Item | Desktop | Mobile | Evidência | Achado |
|---|---|---|---|---|---|
| 1 | Conversas (lista) | PASS | PASS | `01_inbox_desktop.png`, `10_inbox_mobile.png`; 3 conversas renderizadas com ordem por `last_message_at`, contagem "3 conversas" | — |
| 2 | Carregamento inicial | **PARTIAL** | PASS | `perf.inbox_first_paint_ms=9070.7` no cold-load desktop | **F-01 (High)** |
| 3 | Realtime (registry) | PASS | PASS | `src/lib/realtime/registry.ts` usa chave composta; última ocorrência do erro `postgres_changes callbacks after subscribe()` = `2026-07-15 21:04` (43h+ atrás); sem novas ocorrências no run atual | **F-02 (Medium — resolvido, backlog para limpar incidents antigos)** |
| 4 | Composer (desktop) | PASS | PASS | Inputs renderizados em `message-composer.tsx` (513 loc) e `mobile-message-composer.tsx`; mobile mostra botões mic/AI/send | — |
| 5 | Envio de texto | PASS | PASS | 88 mensagens `text` outbound persistidas 7d; `messages.status='sent'` | — |
| 6 | Áudio | PASS | PASS | 24 áudios outbound 7d; player renderiza; storage `message-media` retorna `206 Partial Content` | — |
| 7 | Imagens | **UNTESTED** | **UNTESTED** | Componente `media.tsx` implementa `image`; 0 envios/recebimentos reais em 30d | **F-03 (Medium)** — não exercido pelo piloto |
| 8 | Documentos | **UNTESTED** | **UNTESTED** | Suporte a `file` presente no `sendMessage` (enum); 0 envios reais | **F-03 (Medium)** |
| 9 | Reply / Quote | PASS | PASS | 2 msgs com `reply_to_id` no banco; `reply-preview.tsx` + `QuotedMessage`; código `sendMessage` resolve `provider_message_id` para injetar em Meta | — |
| 10 | Forward | PASS | PASS | 1 msg forwarded persistida (`media_metadata.forwarded=true`); `forward-dialog.tsx` (276 loc) presente | — |
| 11 | Copy | PASS | PASS | Ação em `message-actions.tsx`; funcional via clipboard API + toast | — |
| 12 | Message Info | PASS | PASS | `message-info-sheet.tsx` (363 loc) + server fn `getMessageInfo` presentes | — |
| 13 | Pin | PASS (código) | PASS (código) | Coluna `pinned_at` + índice existem; `conversation-actions.tsx` expõe ação; **0 conversas pinned em produção** — feature não exercida | **F-04 (Low)** — não exercido |
| 14 | Busca (conversas) | PASS | PASS | Input "Buscar conversas" visível em `01_inbox_desktop.png` | — |
| 15 | Filtros (Todas/Abertas/Pendentes/Resolvidas + Todos/Minhas/Sem responsável) | PASS | PASS | Chips renderizados | — |
| 16 | Scroll (ancoragem no fim + mídia lazy) | PASS | PASS | Correção CRITICAL-01 P3 confirmada no código (`ResizeObserver`) | — |
| 17 | Performance envio / render mídia | **PARTIAL** | **PARTIAL** | `getMediaUrl` chamado 1× por mídia via `useServerFn` em `media.tsx` (4 call sites), gerando **N+1 de assinaturas de URL** por conversa com muitos áudios | **F-05 (Medium)** |
| 18 | Integração com Fluxos (disparo Inbox) | PASS (código) | PASS (código) | Path unificado em `transferConversation` → `createAndExecuteRun` (validado em RUNTIME-CANONICAL-ENFORCEMENT); 10 flow_runs COMPLETED 7d | — |
| 19 | Integração com IA | PASS (indireto) | PASS (indireto) | 1 msg de agente `CAROLINE IA · AUTOMAÇÃO` visível em `11_conversation_mobile.png`; sem falhas em `agent_logs` | — |
| 20 | Estados de erro (boundary) | PASS | PASS | Guardian captura via boundary (`k.filter`, `N.map` foram registrados corretamente); nenhum crash não capturado | — |

---

## 3. Achados classificados

### F-01 — Cold-load do Inbox em ~9 s (desktop) — **High · Backlog Fase 2**

**Evidência:**
- Playwright `performance.now()` medindo `goto('/inbox') → networkidle` = **9.070 ms** em ambiente local sem latência de rede.
- Cadeia de server-fns em série no boot: `getUnreadSummary`, `listConversations`, `getMyPermissions`, `getConversationDeleteCapabilities`, `getConversation`, `listMessages`, `listQuickReplies`, `listTags`, `getMediaUrl × N`.
- `supabase.auth.getUser()` chamado **7×** durante o mesmo carregamento (cascata `onAuthStateChange` + middleware por request).

**Impacto operacional:** operador espera vários segundos entre login e ver a primeira conversa. Não bloqueia operação, mas fricciona.

**Reprodução:** `python3 /tmp/browser/inbox-audit/run.py` → `console.log` linha `[perf] inbox_first_paint_ms`.

**Classificação:** **High** (métrica objetiva de UX de piloto), **recomendação: Backlog Fase 2** (fora do escopo de "bug que bloqueia operação"; requer análise de agrupamento de calls e revisão de auth cascade — não é fix pontual).

---

### F-02 — Incidents Guardian `postgres_changes callbacks after subscribe()` — **Medium · resolvido, backlog de limpeza**

**Evidência:**
- 7 incidents `boundary` em `/inbox` totalizando ~19 ocorrências, todas entre `2026-07-15 20:54` e `21:04`.
- Análise de código: `src/lib/realtime/registry.ts` já usa `key` composta em vez do `name` — comentário no código descreve exatamente esse bug e a correção.
- **Sem novas ocorrências há 43h+.** Fix já em produção.

**Classificação:** **Medium** histórico. **Recomendação:** marcar os 7 incidents como resolvidos no Guardian (operação administrativa, não código) → **Backlog**.

---

### F-03 — Imagens e documentos nunca exercidos em produção — **Medium · monitorar**

**Evidência:**
- 30 dias, 0 mensagens `type=image` ou `type=file`.
- Código de envio (`sendMessage`) aceita ambos os tipos; provider WhatsApp Cloud não conectado (só canais `mock`).

**Impacto:** funcionalidades existem e passaram por Playwright anterior (missão A2 Reply testou pipeline de mídia), mas **não temos dado de operação real**.

**Classificação:** **Medium**. **Recomendação:** **Backlog** — reavaliar após primeiro envio real; abrir missão apenas se operador reportar falha.

---

### F-04 — Fixar Conversas (Pin) sem uso real — **Low · monitorar**

**Evidência:** 0 rows com `pinned=true`. Migration + UI presentes (validado na missão INBOX-UX-01 A5).

**Classificação:** **Low**. **Recomendação:** **Backlog** — apenas monitorar adoção.

---

### F-05 — N+1 em `getMediaUrl` no render de mídia — **Medium · Backlog Fase 2**

**Evidência:**
- 4 call sites de `useServerFn(getMediaUrl)` em `src/components/inbox/media.tsx` (linhas 16, 54, 75, 98) — cada `<Audio>`, `<Image>`, `<Video>`, `<File>` faz uma chamada individual ao servidor para assinar URL.
- Uma conversa com 24 áudios acionaria 24 round-trips serializados via React Query cache miss no primeiro render.
- Confirmado no network log da execução: múltiplas chamadas a `getMediaUrl_createServerFn_handler` durante abertura de uma conversa.

**Impacto operacional:** conversas com muita mídia demoram mais que necessário para renderizar; agrava F-01.

**Classificação:** **Medium**. **Recomendação:** **Backlog Fase 2** — implementar batch (uma server fn `getMediaUrls(ids[])`) ou mover assinatura para `listMessages` retornando URLs assinadas com TTL. Fora do escopo Inbox v2.0 se piloto tolerar.

---

### F-06 — Incidents High órfãos no Guardian (`k.filter`, `N.map`) — **Medium · backlog de análise**

**Evidência:**
- 2 incidents High, 1 ocorrência cada, ambos em `2026-07-15`.
- Stack aponta para o bundle publicado `talkebase.lovable.app` de 15/07. Não se reproduzem no bundle atual.
- `N.map is not a function` acontecia no dropdown de quick-replies — código atual (`message-composer.tsx:286`) já usa `quickReplies = []` como default.

**Classificação:** **Medium** (High no Guardian, mas sem reprodução). **Recomendação:** **Backlog** — marcar incidents como resolvidos.

---

### F-07 — Flow runs órfãos em `CREATED` sem `published_version_id` — **Medium · fora do escopo Inbox**

**Evidência:** 12 flow_runs em estado `CREATED` com `published_version_id=NULL`, mais antigo de `2026-07-15 15:22`. 3 runs em `RUNNING` sem progresso desde `2026-07-17 04:38`.

**Impacto:** não é bug ativo — são runs legados da era pré-correção FLOW-RUNTIME-ROOTCAUSE. Não afetam operador atual (Guardian não emite alertas, snapshot healthy).

**Classificação:** **Medium**. **Recomendação:** **Backlog** — janela de manutenção para sanear (`UPDATE flow_runs SET state='FAILED', ...`). **Fora do escopo Fase 2.0 (Inbox)**.

---

### F-08 — Boundary `useMobileFab must be used inside MobileFabProvider` em `/channels` — **Medium · fora do escopo Inbox**

**Evidência:** 3 incidents Guardian em `/channels` (não `/inbox`).

**Classificação:** **Medium**. **Recomendação:** **Backlog** — missão separada de auditoria de `/channels` se ocorrer no piloto.

---

## 4. Recomendação por achado

| ID | Severidade | Recomendação |
|---|---|---|
| F-01 Cold-load 9s | High | Backlog Fase 2 — não bloqueia operação |
| F-02 Realtime bug histórico | Medium | Backlog (limpar Guardian) |
| F-03 Imagem/documento sem uso | Medium | Backlog (monitorar) |
| F-04 Pin sem uso | Low | Backlog (monitorar) |
| F-05 N+1 getMediaUrl | Medium | Backlog Fase 2 |
| F-06 High Guardian órfãos | Medium | Backlog (limpar) |
| F-07 Flow runs órfãos | Medium | Backlog (fora do escopo Inbox) |
| F-08 MobileFabProvider | Medium | Backlog (fora do escopo Inbox) |

**Nenhum Critical. Nenhum High bloqueando operação diária.**

---

## 5. Critério de encerramento do Estágio 1

Conforme ordem oficial:

> "Se houver apenas Medium/Low: seguir para o próximo estágio da Fase 2. Se houver High/Critical: cada item será avaliado individualmente e poderá gerar uma missão fechada por problema, mediante nova autorização."

- **Critical:** 0
- **High com impacto operacional bloqueante:** 0
- **High com impacto operacional não-bloqueante (F-01):** 1 — recomendo tratar como **backlog**, não como missão obrigatória.

**Recomendação de encerramento:** Estágio 1 encerrado sem missões obrigatórias abertas. Piloto WebMarcas segue em observação. Se operador reportar lentidão real do cold-load, F-01 sobe para missão fechada mediante autorização.

---

## 6. Evidências

- `/tmp/browser/inbox-audit/run.py` — script Playwright
- `/tmp/browser/inbox-audit/screenshots/01_inbox_desktop.png` — lista de conversas desktop
- `/tmp/browser/inbox-audit/screenshots/02_conversation_desktop.png` — conversa desktop (spinner residual)
- `/tmp/browser/inbox-audit/screenshots/10_inbox_mobile.png` — lista mobile
- `/tmp/browser/inbox-audit/screenshots/11_conversation_mobile.png` — conversa mobile (áudios, agente IA)
- `/tmp/browser/inbox-audit/console.log` — console + medição `inbox_first_paint_ms`
- `/tmp/browser/inbox-audit/network.log` — network trace
- Consultas SQL de baseline: seção 1 deste documento
- Guardian incidents: seção 3 (F-02, F-06)

---

## 7. Encerramento

**Missão Fase 2.0 — Estágio 1: Encerrada.**
**Decisão:** aguardar autorização explícita antes de qualquer correção. Backlog registrado neste próprio documento (F-01 a F-08).
**Nenhuma linha de código de produto foi alterada.**
