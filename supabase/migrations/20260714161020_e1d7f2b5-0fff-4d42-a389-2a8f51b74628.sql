REVOKE EXECUTE ON FUNCTION public.bump_channel_metrics() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.bump_broadcast_counters() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon;