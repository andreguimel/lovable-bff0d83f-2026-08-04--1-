/**
 * FB-02 — Feature flag do Flow Builder V2.
 * FB-03 — Ligado em desktop: rota `/flows/:id` monta o novo Canvas V2 e
 * o novo sistema de Nodes por padrão. Rollback = trocar para `false`;
 * V1 permanece intocado em `src/components/flows/studio/*` e no route
 * como fallback.
 */
export const FLOW_BUILDER_V2_ENABLED = true;
