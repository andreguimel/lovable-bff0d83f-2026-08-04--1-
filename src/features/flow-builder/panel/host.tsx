/**
 * FB-02 — Painel lateral único.
 *
 * Todo Node abre exatamente este painel. Somente o conteúdo interno
 * (o `Inspector` do bloco selecionado, resolvido via Registry) muda.
 * Nunca criar Drawer, Modal ou Popup adicionais.
 *
 * O host é *headless* quanto ao layout: recebe o slot renderizado pelo
 * shell (FB-03+). Aqui centralizamos apenas a lógica de resolução do
 * Inspector correto e o wiring com a store.
 */
import { useCallback } from "react";
import { blockRegistry } from "../blocks/registry";
import { useSelectedNode } from "../state/selectors";
import { useBuilderStore } from "../state/store";

export interface InspectorHostRender {
  nodeId: string;
  kind: string;
  label: string;
  Inspector: React.ComponentType<{
    nodeId: string;
    data: Record<string, unknown>;
    onChange: (patch: Record<string, unknown>) => void;
  }> | null;
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}

/**
 * Hook consumido pelo painel lateral. Retorna `null` quando nada está
 * selecionado (o shell decide se mostra empty-state ou colapsa).
 */
export function useInspectorHost(): InspectorHostRender | null {
  const node = useSelectedNode();
  const updateNodeData = useBuilderStore((s) => s.updateNodeData);

  const onChange = useCallback(
    (patch: Record<string, unknown>) => {
      if (!node) return;
      updateNodeData(node.id, patch);
    },
    [node, updateNodeData],
  );

  if (!node) return null;
  const def = blockRegistry.get(node.kind);
  return {
    nodeId: node.id,
    kind: node.kind,
    label: def?.meta.label ?? node.kind,
    Inspector:
      (def?.Inspector as InspectorHostRender["Inspector"]) ?? null,
    data: node.data,
    onChange,
  };
}
