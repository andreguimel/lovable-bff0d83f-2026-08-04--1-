# META WhatsApp Cloud — Provider Acceptance

## FINAL API PHASE 01 — Status

| Etapa | Status |
| --- | --- |
| PRE-FLIGHT | PASS |
| TEST CONNECTION IMPLEMENTATION | PASS |
| REAL CREDENTIAL TEST | WAITING OWNER |
| WEBHOOK REAL | WAITING |
| OUTBOUND REAL | WAITING |
| INBOUND REAL | WAITING |

## Escopo desta fase (Test Connection Hotfix)

- Nova server function `testChannelConnection` (`src/lib/channels.functions.ts`).
- Botão "Testar conexão" em `IntegrationSettings` (`src/components/channels/channel-detail-drawer.tsx`), habilitado apenas com `has_phone_number_id && has_access_token`.
- Chamada real `GET https://graph.facebook.com/v20.0/{phone_number_id}?fields=display_phone_number,verified_name,id` usando `Authorization: Bearer <access_token>` salvo no canal.
- Em sucesso: `status = connected`, `last_connected_at = now()`. Nenhum novo campo/schema/migration.
- Registro de evento em `channel_events` (`test_connection_ok` / `test_connection_failed`) sem qualquer segredo no payload.

## Erros classificados (mensagens sanitizadas)

| Código | Origem | Mensagem ao operador |
| --- | --- | --- |
| `TOKEN_INVALID` | 401 / meta code 190 / OAuthException | Access Token inválido, expirado ou não autorizado. |
| `PHONE_ID_INVALID` | 404 / meta code 100 | Phone Number ID inválido ou inacessível com este token. |
| `PERMISSION_DENIED` | 403 / meta code 200 ou 10 | Permissão insuficiente. Confira as permissões do token na Meta. |
| `META_ERROR` | outro erro Graph | A Meta rejeitou a requisição. Verifique as credenciais. |
| `NETWORK_ERROR` | falha de fetch | Falha de rede ao contatar a Meta. Tente novamente. |
| `MISSING_CREDENTIALS` | credenciais ausentes | Configure Phone Number ID e Access Token antes de testar. |

Nenhum retorno vaza `access_token`, `app_secret`, `webhook_verify_token`, headers, payload bruto da Meta ou stack interno.

## WABA_ID — decisão registrada

O pipeline real de send/webhook/provider (`src/lib/wa-providers/whatsapp-cloud.server.ts` e `src/routes/api/public/webhooks/whatsapp.$channelId.ts`) **não consome `waba_id`**. Portanto ele **não é introduzido** neste hotfix. Fonte da verdade é a implementação real, não a documentação anterior. Reavaliar apenas se um caminho real passar a exigi-lo.

## App Secret — nota de contrato atual

- O POST do webhook (`/api/public/webhooks/whatsapp/:channelId`) valida `x-hub-signature-256` (HMAC-SHA256) **quando `app_secret` está configurado** no canal.
- Se `app_secret` não estiver configurado, o webhook **aceita** a chamada sem verificação de assinatura.
- Para PROVIDER ACCEPTANCE REAL de produção, `app_secret` **deve** estar configurado. Esta correção não altera o contrato.

## Segurança

- AUTH: PASS (`requireSupabaseAuth`)
- RBAC: PASS (fluxo apenas via UI autenticada + server fn com middleware)
- MULTI-TENANCY: PASS (queries via `context.supabase` respeitam RLS por `company_id`)
- DIRECT-ID ISOLATION: PASS (SELECT por `id` sob RLS; canal de outra empresa retorna `Canal não encontrado`)
- SECRET LEAK TO CLIENT: 0
- SECRET LEAK TO LOGS: 0 (evento registra apenas status HTTP + código classificado + campos públicos `display_phone_number` / `verified_name`)

## Próxima ação

`WAITING OWNER CREDENTIAL CONFIGURATION` — o proprietário configura credenciais em Zenda → Canais → canal WhatsApp Cloud → Integração/Configuração e aciona **Testar conexão**.
