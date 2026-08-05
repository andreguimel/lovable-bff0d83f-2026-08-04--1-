CREATE OR REPLACE FUNCTION public.next_flow_version_number(_flow_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(version_number), 0) + 1
  FROM public.flow_versions
  WHERE flow_id = _flow_id
$$;