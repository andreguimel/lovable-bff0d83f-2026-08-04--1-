ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
UPDATE public.conversations SET pinned_at = COALESCE(last_message_at, updated_at, now()) WHERE pinned = true AND pinned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_pinned_order ON public.conversations (company_id, pinned DESC, pinned_at DESC NULLS LAST, last_message_at DESC NULLS LAST);