-- SEC-H-01: Fortalecer public.exec_read_sql
-- Estratégia dupla:
--   1) Sanitização textual mais restritiva (deve iniciar com SELECT/WITH; sem `;`).
--   2) Defesa real via SET LOCAL transaction_read_only = on:
--      qualquer INSERT/UPDATE/DELETE/DDL executado dentro do EXECUTE falhará
--      no nível do Postgres, mesmo se o parser textual for burlado.
-- EXECUTE permanece restrito a service_role (revogações anteriores mantidas).

CREATE OR REPLACE FUNCTION public.exec_read_sql(p_sql text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  cleaned text;
BEGIN
  IF p_sql IS NULL THEN
    RAISE EXCEPTION 'SQL vazio';
  END IF;

  -- Normaliza: trim + remove ; final(is)
  cleaned := regexp_replace(btrim(p_sql), ';+\s*$', '');

  -- Proíbe múltiplas instruções: nenhum `;` restante
  IF position(';' in cleaned) > 0 THEN
    RAISE EXCEPTION 'Múltiplas instruções não permitidas';
  END IF;

  -- Deve iniciar com SELECT ou WITH (case-insensitive)
  IF cleaned !~* '^\s*(select|with)\s' THEN
    RAISE EXCEPTION 'Somente SELECT/WITH permitido';
  END IF;

  -- Defesa real no nível do Postgres: bloqueia qualquer escrita/DDL
  -- ainda que o parser textual fosse burlado (comentários, aspas, CTEs).
  SET LOCAL transaction_read_only = on;

  EXECUTE format('SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) AS t', cleaned)
  INTO result;

  RETURN result;
END;
$function$;

-- Reforço defensivo (idempotente): garantir que somente service_role executa.
REVOKE ALL ON FUNCTION public.exec_read_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_read_sql(text) TO service_role;