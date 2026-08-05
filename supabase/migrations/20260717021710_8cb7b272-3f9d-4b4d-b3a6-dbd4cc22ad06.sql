-- CRITICAL-01 P1: Sanar fluxos marcados como 'active' sem versão publicada.
-- Motivo: setFlowStatus permitia ativar sem exigir versão publicada, gerando
-- inconsistência entre o badge "Ativo" da UI e o Runtime (que corretamente
-- exige uma flow_versions com status='published').
UPDATE public.flows f
SET status = 'draft'
WHERE status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.flow_versions v
    WHERE v.flow_id = f.id
      AND v.status = 'published'
  );