CREATE OR REPLACE FUNCTION public.exec_read_sql(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  lower_sql text := lower(regexp_replace(p_sql, '\s+', ' ', 'g'));
BEGIN
  IF position('insert ' in lower_sql) > 0
     OR position('update ' in lower_sql) > 0
     OR position('delete ' in lower_sql) > 0
     OR position('drop ' in lower_sql) > 0
     OR position('alter ' in lower_sql) > 0
     OR position('truncate ' in lower_sql) > 0
     OR position('grant ' in lower_sql) > 0
     OR position('revoke ' in lower_sql) > 0
     OR position('create ' in lower_sql) > 0
     OR position(';' in trim(trailing ';' from p_sql)) > 0 THEN
    RAISE EXCEPTION 'Somente SELECT permitido';
  END IF;

  EXECUTE format('SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) AS t', p_sql)
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.exec_read_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_read_sql(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_read_sql(text) TO service_role;