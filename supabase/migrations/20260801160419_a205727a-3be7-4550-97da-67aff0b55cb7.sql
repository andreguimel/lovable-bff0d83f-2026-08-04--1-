CREATE UNIQUE INDEX IF NOT EXISTS messages_inbound_provider_uidx
ON public.messages (conversation_id, provider_message_id)
WHERE direction = 'inbound' AND provider_message_id IS NOT NULL AND provider_message_id <> '';