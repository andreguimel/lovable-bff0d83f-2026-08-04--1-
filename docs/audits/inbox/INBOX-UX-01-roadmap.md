# INBOX-UX-01 — Roadmap Executivo de Paridade WhatsApp Web

**Data:** 2026-07-16
**Tipo:** Documento estratégico. **Nenhuma alteração de código, migration, Runtime ou Provider.**
**Base:** `docs/audits/inbox/INBOX-UX-01-viability-matrix.md`.
**Objetivo:** transformar a matriz de viabilidade em decisão de investimento, priorizando por ROI (valor operacional ÷ complexidade).

---

## 1. Metodologia

- **Valor para o operador (1–5):** frequência de uso diário no WhatsApp Web × impacto em tempo de atendimento e qualidade percebida pelo cliente.
- **Complexidade (1–5):** soma ponderada de novas migrations, server functions, integrações por provider, e superfície de UI.
- **ROI:** `Valor ÷ Complexidade` (arredondado a 1 casa; ≥ 2,0 = alto, 1,0–1,9 = médio, < 1,0 = baixo).
- **Provider:** capacidade real hoje, considerando WhatsApp Cloud como principal.
- **Peso na paridade:** cada item vale ~4,5 % de paridade (22 ações mapeadas no Inbox WhatsApp Web relevantes ao caso multi-atendente).

---

## 2. Matriz priorizada por impacto

| # | Funcionalidade | Valor | Complexidade | Dependências | Provider | ROI |
|---:|---|---:|---:|---|---|---:|
| 1 | **Copiar texto (mensagem)** | 4 | 1 | 1 item em `message-actions.tsx` | Todos | **4,0** |
| 2 | **Responder (quote)** | 5 | 2 | Estado no composer + `context.message_id` no Cloud adapter | Cloud ✅ · Evo/Bail ⚠️ | **2,5** |
| 3 | **Informações da conversa** | 3 | 1 | Reaproveitar `contact-panel` | N/A | **3,0** |
| 4 | **Encaminhar (single)** | 4 | 2 | Dialog seletor + `forwardMessage` reusa `dispatchSend` | Cloud ✅ | **2,0** |
| 5 | **Informações da mensagem (timestamps)** | 4 | 3 | Migration `message_receipts` OU colunas `*_at`, webhook grava eventos | Cloud ✅ | **1,3** |
| 6 | **Arquivar conversa** | 4 | 3 | Migration `conversations.archived_at` + filtro | Local | **1,3** |
| 7 | **Reagir (emoji)** | 4 | 4 | Migration `message_reactions` + webhook + endpoint reaction | Cloud ✅ | **1,0** |
| 8 | **Favoritar mensagem** | 2 | 3 | Migration `message_stars` + filtro "favoritas" | Local | **0,7** |
| 9 | **Silenciar conversa** | 2 | 3 | Migration `conversation_mute` + hook de notificações | Local | **0,7** |
| 10 | **Encaminhar multi-destino** | 3 | 4 | Extensão do #4 com fan-out e rate limit | Cloud ✅ | **0,8** |
| 11 | **Editar (Evolution/Baileys)** | 2 | 4 | Depende de ligar send nesses providers primeiro | Evo/Bail | **0,5** |
| — | **Editar (Cloud)** | — | — | — | 🔴 **BLOQUEADO Meta** | — |
| — | **Excluir para todos (Cloud)** | — | — | — | 🔴 **BLOQUEADO Meta** | — |

---

## 3. Agrupamento por decisão de investimento

### 🟢 Grupo A — Implementar imediatamente (antes do piloto ou junto dele)

Alto ROI · sem migration · sem alteração de arquitetura · suportado por Cloud.

| # | Item | Esforço estimado | Ganho de paridade |
|---:|---|---|---:|
| 1 | Copiar texto (mensagem) | ~1 h | +4,5 pp |
| 2 | Responder (quote) | ~1 dia | +4,5 pp |
| 3 | Informações da conversa | ~0,5 dia | +4,5 pp |
| 4 | Encaminhar (single) | ~1,5 dia | +4,5 pp |

**Total Grupo A: ~3 dias de dev · +18 pp de paridade.**

### 🟡 Grupo B — Implementar antes do GA

ROI médio · exige migration/backend · alto valor operacional comprovado no WhatsApp Web.

| # | Item | Esforço estimado | Ganho | Justificativa GA |
|---:|---|---|---:|---|
| 5 | Informações da mensagem (timestamps) | ~2 dias | +4,5 pp | Cliente cobra "foi lido?"; hoje só existe último status |
| 6 | Arquivar conversa | ~2 dias | +4,5 pp | Higiene de inbox em operação real |
| 7 | Reagir (emoji) | ~3 dias | +4,5 pp | Uso muito frequente pelo cliente final; sem isso mensagens de reação chegam como "❤️ Reagiu a…" e poluem o inbox |

**Total Grupo B: ~7 dias de dev · +13,5 pp de paridade.**

### 🔵 Grupo C — Pós-GA (backlog vivo)

Valor menor ou complexidade desproporcional ao ganho na WebMarcas.

| # | Item | Motivo de adiar |
|---:|---|---|
| 8 | Favoritar mensagem | Uso baixo em operação multi-atendente; substituível por tags de contato já existentes |
| 9 | Silenciar conversa | Operador raramente silencia clientes; preferências globais já cobrem 90 % dos casos |
| 10 | Encaminhar multi-destino | Broadcast já resolve envio em massa com governança melhor |
| 11 | Editar (Evolution/Baileys) | Depende de ligar send nesses providers, o que é outro projeto |

**Total Grupo C: ~7 dias de dev · +9 pp de paridade.**

### 🔴 Grupo D — Impossíveis / limitadas pela API

| Item | Provider | Motivo |
|---|---|---|
| **Editar mensagem free-form** | WhatsApp Cloud | Meta não expõe endpoint público. Apenas mensagens do tipo **template** com aprovação prévia podem ser editadas — não serve para conversa 1:1. |
| **Excluir para todos (revoke)** | WhatsApp Cloud | Meta não expõe endpoint público de revoke. Já documentado em `message-delete.functions.ts`. Só é possível "excluir para mim" no CRM. |
| **Star / Archive / Mute como estado sincronizado com o app WhatsApp do cliente** | Todos os providers | Não existem no protocolo WhatsApp Business API. São estado **local do cliente oficial**. Implementar no CRM (Grupos B/C) é aceitável e é o que o próprio WhatsApp Web faz (armazenamento local do dispositivo) — mas nunca vai refletir no aparelho do cliente. |
| **Ver "visualizado por" em grupos** | Todos | WhatsApp Business API não suporta grupos como conversas atendidas via CRM. |
| **Chamadas de voz/vídeo** | Todos | Fora do escopo da Business API. |

**Impacto:** ~9 pp de paridade que **nunca** serão recuperados enquanto WhatsApp Cloud for o provider principal. Recuperáveis parcialmente (revoke + edit) migrando envio para Evolution/Baileys, com o custo de sair da API oficial da Meta (risco de banimento de número).

---

## 4. Tabela executiva de paridade

| Cenário | Paridade | Δ vs. hoje | Custo agregado |
|---|---:|---:|---|
| **Inbox atual (RC3.1)** | **~48 %** | — | 0 |
| Após Grupo A | ~66 % | +18 pp | ~3 dias |
| Após Grupo A + B | ~79 % | +31 pp | ~10 dias |
| Após Grupo A + B + C | ~89 % | +41 pp | ~17 dias |
| **Teto WhatsApp Cloud (Grupo D permanente)** | **~91 %** | +43 pp | — |
| **Teto Evolution/Baileys ligado como send** | **~95–96 %** | +47–48 pp | +10–15 dias adicionais e risco de compliance |
| Paridade 100 % WhatsApp Web | **inatingível** | — | Requer app oficial WhatsApp, não WhatsApp Business API |

---

## 5. Recomendação executiva

1. **Piloto WebMarcas roda hoje** com 48 % de paridade — suficiente para operação básica supervisionada.
2. **Grupo A (3 dias)** leva o Inbox a **~66 %** e resolve as três reclamações mais previsíveis do piloto: "não consigo responder citando", "não consigo encaminhar", "não consigo copiar rápido". Recomendo executar em paralelo ao piloto.
3. **Grupo B (7 dias)** é o pacote de GA. Sem ele, "foi lido às 14:32?", "arquiva essa conversa" e reactions poluindo o inbox continuam sendo atrito diário.
4. **Grupo C** só se justifica se o piloto pedir explicitamente. Caso contrário, permanece no backlog.
5. **Grupo D** deve ser comunicado ao cliente final como "limitação oficial da Meta" — não como bug do produto. Documentar em FAQ interna evita expectativa mal calibrada no comercial.
6. **Não migrar** para Evolution/Baileys apenas para ganhar 4–5 pp: o risco de banimento de número WhatsApp Business não compensa o ganho marginal.

---

## Encerramento

Roadmap executivo entregue. Nenhuma implementação nesta missão. A decisão sobre executar Grupo A durante o piloto ou aguardar feedback do uso real é do product owner.
