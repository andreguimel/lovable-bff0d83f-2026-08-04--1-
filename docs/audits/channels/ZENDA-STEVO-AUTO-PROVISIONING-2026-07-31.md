# Stevo — provisionamento automático de instância

Data: 2026-07-31

## Escopo

Permitir que o próprio Zenda crie e inicialize uma instância Stevo ao criar um canal, sem depender do painel externo.

## Implementação

- O formulário oferece **Criar e ativar nova instância** como opção padrão.
- O backend chama `POST /v1/instances` com a chave da conta mantida no servidor.
- O `instance_id` retornado é persistido em `channels.credentials`.
- O servidor SM v2 retornado pela Stevo é inicializado por `POST /instance/connect` com inscrição em todos os eventos.
- A geração do QR continua usando o servidor específico da instância e o token nunca é enviado ao cliente.

## Evidências

- API de gestão confirmou listagem e criação de instâncias.
- Servidor SM v2 confirmou `POST /instance/connect` com HTTP 200.
- `GET /instance/status` retornou servidor conectado e sessão ainda não pareada.
- `GET /instance/qr` retornou a imagem do QR Code.

## Decisão

**Encerrada.** O canal Stevo pode ser criado, provisionado, iniciado e pareado integralmente pelo Zenda.