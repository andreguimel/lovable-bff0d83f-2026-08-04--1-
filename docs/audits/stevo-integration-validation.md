# Validação da Integração Stevo (Zenda) — 2026-07-31

Escopo auditado: integração Stevo como `channel_provider` (decisão anterior: credencial única do
workspace, sem alteração de arquitetura/RBAC/RLS). Auth de usuários continua sendo Supabase — a
Stevo **não** é IdP, portanto os itens de login/registro/reset via Stevo não se aplicam.

## 1. Resultado por eixo

| Eixo | Status | Observações |
|---|---|---|
| Credenciais | OK | `STEVO_API_KEY` só é lida em `process.env` dentro de `*.server.ts`; canal guarda apenas `{ instance_id }`. |
| Exposição ao client | OK | `getChannel` devolve `credentials: null` + `credentials_status`; `updateChannel` faz merge com o valor do banco (não apaga segredo em patch parcial). |
| Autorização | OK | `listStevoInstancesFn` e `testChannelConnection` usam `.middleware([requireSupabaseAuth])`; leitura de canal filtrada por `company_id` via RLS. |
| Mapeamento de dados | OK | `id`, `name`, `status`, `phone_number → phone`, `engine`, `connected` validados contra resposta real da API (HTTP 200). |
| Tratamento de erros | OK | Códigos `MISSING_API_KEY`, `MISSING_CREDENTIALS`, `UNAUTHORIZED`, `INSTANCE_NOT_FOUND`, `STEVO_ERROR`, `NETWORK_ERROR`, todos com mensagem PT-BR amigável; nenhum corpo bruto da Stevo vaza para a UI. |
| Transporte | OK | HTTPS obrigatório (`https://openapi.stevo.chat`), token só em header `Authorization` server-side. |
| Validação de entrada | OK | `instance_id` passa por `encodeURIComponent`; destino normalizado (`[^0-9]`); payload de canal validado com Zod. |
| Logs | OK | `logEvent` grava `test_connection_ok/_failed` em `channel_events` com status e código (sem token). |
| UI/UX | OK | Estados de loading/erro/vazio no seletor de instância, fallback para input manual quando a listagem falha, botão bloqueado sem instância, labels e componentes shadcn (tokens do design system, responsivo em sheet). |
| Typecheck | OK | `tsgo --noEmit` sem erros. |
| Testes | OK (suíte Stevo/dispatch) | `bun test`: 426 passam, 5 falham. |

## 2. Pendências / limitações conhecidas (não bloqueantes)

1. **Inbound e revoke não suportados** — a API de gestão Stevo não expõe webhook de recebimento nem
   delete de mensagem. Envio (texto/mídia) funciona; recebimento exige webhook do servidor da
   instância. Backlog.
2. **Sem retry/backoff nem circuit breaker** no adapter Stevo — hoje uma falha de rede retorna
   `NETWORK_ERROR` na primeira tentativa. Rate limit da Stevo não é tratado explicitamente
   (HTTP 429 cai em `STEVO_ERROR`). Backlog (Médio).
3. **5 testes falhando em `guardian-alerter.test.ts`** — pré-existentes e sem relação com Stevo:
   incompatibilidade do runner (`vi.stubGlobal` indisponível no shim do `bun test`). Backlog.
4. **Findings do scanner Supabase** (warn, pré-existentes): funções `SECURITY DEFINER` executáveis
   por `anon`/`authenticated` e *leaked password protection* desabilitada. Não introduzidos por
   esta integração.
5. **E2E autenticado não executável** — o projeto usa Supabase externo (`external_unmanaged`), então
   não há sessão injetável no sandbox; a validação de UI foi feita por revisão de código.

## 3. Decisão

**Encerrada.** Integração Stevo validada nos critérios de funcionalidade, segurança, UX e
observabilidade dentro do escopo acordado. Itens 1–4 acima registrados como backlog.
