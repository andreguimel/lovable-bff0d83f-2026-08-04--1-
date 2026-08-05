UPDATE public.channels
SET provider_type = 'stevo', updated_at = now()
WHERE provider_type <> 'stevo'
  AND credentials ? 'instance_id'
  AND NOT (credentials ? 'phone_number_id');