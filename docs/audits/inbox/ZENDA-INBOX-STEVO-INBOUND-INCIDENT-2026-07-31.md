# Incidente Inbox / Stevo — 2026-07-31

## Resultado

**Decisão: Encerrada.**

## Causas raiz comprovadas

`ensureStevoWebhook` derivava a URL do webhook diretamente da origem da requisição. Quando a sincronização era iniciada pelo editor, essa origem era `id-preview--<project-id>.lovable.app`, domínio protegido pelo login do Lovable. Assim, uma chamada externa da Stevo recebia a página de autenticação em vez do receptor público.

O endpoint público estável de preview é `project--<project-id>-dev.lovable.app`. A derivação agora converte automaticamente a origem protegida do editor para esse domínio público antes de registrar o webhook.

Além disso, o normalizador priorizava `root.event` mesmo quando esse campo era apenas a string `"messages.upsert"`. No formato Evolution/Stevo, o conteúdo real fica em `root.data`; como uma string era convertida em objeto vazio, a mensagem era descartada silenciosamente. O parser agora usa `event` somente quando ele é objeto e, caso contrário, lê `data` ou `payload`.

Por fim, a engine SM v2 atual descartava silenciosamente `subscribe: ["All"]`. A própria resposta de `POST /instance/connect` confirmava `eventString: ""`, portanto o webhook estava salvo, mas nenhum evento estava assinado. O sistema agora registra explicitamente `MESSAGE` e `READ_RECEIPT`.

## Evidências

- Canal Stevo `b3a11289-eb65-4f3e-a053-7a61aed80c3d`: conectado e com token de webhook.
- Banco: somente 2 mensagens inbound, ambas payloads sintéticos (`TESTE-WH-003` e `TESTE-WH-DEPLOY-1`).
- Último webhook inbound registrado: `2026-07-31 19:03:24 UTC`.
- Último re-registro do webhook: `2026-07-31 19:39:01 UTC`; depois dele não houve qualquer evento inbound real.
- A URL `id-preview--.../api/public/webhooks/stevo/...` exige login Lovable.
- A URL `project--...-dev.lovable.app/api/public/webhooks/stevo/...` responde `200 ok` sem autenticação.
- O banco, as políticas RLS, os grants, a consulta `listConversations` e o receptor conseguem persistir e listar os dois testes; portanto, a falha antecede o banco e o Inbox.
- Antes da correção, `POST /instance/connect` retornou HTTP 200 com a URL pública correta, porém `eventString: ""`.
- Depois da correção, a mesma instância retornou HTTP 200, `eventString: "MESSAGE,READ_RECEIPT"` e confirmou a URL pública esperada.
- Os 2 testes de regressão do normalizador Stevo passaram.

## Correção

- Normalização da origem em `ensureStevoWebhook`: `id-preview--<id>.lovable.app` passa a registrar `project--<id>-dev.lovable.app`.
- Correção do normalizador para payloads `{ event: "messages.upsert", data: {...} }`, coberta por teste de regressão.
- Substituição do curinga incompatível `All` pelos eventos explícitos `MESSAGE` e `READ_RECEIPT` tanto na ativação quanto no re-registro do webhook.
- Nenhuma alteração de banco, RLS, RBAC, Runtime Engine, Event Bus ou Design System.

## Ação operacional executada

A instância conectada foi re-registrada diretamente com `MESSAGE` e `READ_RECEIPT`; não é necessário reconectar o WhatsApp nem gerar outro QR Code. A próxima mensagem real já deve produzir um evento `webhook_received` com `inbound: 1` e aparecer no Inbox.