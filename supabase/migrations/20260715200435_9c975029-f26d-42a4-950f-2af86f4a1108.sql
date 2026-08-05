
-- 1) Drop the permissive anon SELECT policy
DROP POLICY IF EXISTS "Anon can read invite by token" ON public.pending_invites;

-- 2) Revoke direct table access from anon (authenticated policies remain in place)
REVOKE ALL ON public.pending_invites FROM anon;

-- 3) Security-definer function returning only minimal invite data by token
CREATE OR REPLACE FUNCTION public.preview_invite_by_token(_token text)
RETURNS TABLE (
  found boolean,
  email text,
  role app_role,
  status text,
  expires_at timestamptz,
  company_name text,
  expired boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
BEGIN
  IF _token IS NULL OR length(_token) < 10 THEN
    RETURN QUERY SELECT false, NULL::text, NULL::app_role, NULL::text, NULL::timestamptz, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  SELECT pi.email, pi.role, pi.status, pi.expires_at, c.name AS company_name
    INTO inv
  FROM public.pending_invites pi
  LEFT JOIN public.companies c ON c.id = pi.company_id
  WHERE pi.token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::app_role, NULL::text, NULL::timestamptz, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    inv.email,
    inv.role,
    inv.status,
    inv.expires_at,
    inv.company_name,
    (inv.expires_at < now());
END;
$$;

-- 4) Lock down and grant EXECUTE narrowly
REVOKE ALL ON FUNCTION public.preview_invite_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_invite_by_token(text) TO anon, authenticated;
