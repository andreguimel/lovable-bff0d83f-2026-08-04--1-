# STORAGE.md

## Estado atual

4 buckets Supabase Storage, **todos privados**:

| Bucket | Uso | Objetos (produção) |
|---|---|---|
| `message-media` | Áudio/vídeo/imagem/documento enviado ou recebido em conversas | 7 |
| `agent-knowledge` | Documentos de knowledge base de agentes IA | 0 |
| `avatars` | Avatares de usuários/contatos | 0 |
| `contact-files` | Arquivos anexados a contatos no CRM | 0 |

## Pontos fortes

- **Nenhum bucket público** — todo acesso passa por signed URL ou server function.
- **Convenção multi-tenant**: paths começam por `company_id/…` (verificado em código de upload).
- **Upload feito via server function** com validação Zod (extensão, MIME, tamanho).
- **Deleção de mensagem** (`message-delete.functions.ts` + `message_deletions` tabela) trata mídia associada.

## Riscos

| ID | Severidade | Achado |
|---|---|---|
| ST-M-01 | Medium | Não há **lifecycle policy** (TTL) para `message-media` — mídia acumula indefinidamente após deleção de conversa. |
| ST-M-02 | Medium | Faltam **quotas por company** — plano free/pro/business não limita storage. `plan_limits` tem `storage_mb` mas não é enforçado no upload. |
| ST-L-03 | Low | Faltam testes automatizados de policy de bucket (upload cross-tenant deve falhar). |
| ST-L-04 | Low | `agent-knowledge`, `avatars`, `contact-files` sem uso — validar antes do piloto se features estarão ativas. |

## Evidências

- `SELECT bucket_id, count(*) FROM storage.objects` → só `message-media` (7 objetos).
- Buckets listados no context da plataforma (todos `Is Public: No`).
- `plan_limits.storage_mb` existe mas grep não encontra enforcement no upload path.

## Recomendações (backlog)

- **ST-M-01** → lifecycle rule para `message-media` (ex.: deletar objetos órfãos > 90 dias). **Pós-piloto**.
- **ST-M-02** → enforcement de `storage_mb` no upload (server function checa uso agregado antes de aceitar). **Pós-piloto**.
- **ST-L-03/04** → pós-piloto.

**Recomendação Fase 1:** storage **congelável**. Nenhum Critical/High. Volume atual mínimo, dívida operacional é pós-piloto.
