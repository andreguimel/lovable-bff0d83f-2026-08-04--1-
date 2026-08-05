/**
 * FB-03 · FB-10.3.1 — Estilo canônico de aresta.
 *
 * Curvas suaves via `smoothstep`, LINHA CONTÍNUA por padrão (sem
 * `animated` global, que deixava tudo tracejado e visualmente frágil).
 * Cores por handle:
 *  - `sourceHandle === "true"`  → verde (Sim)
 *  - `sourceHandle === "false"` → vermelho (Não)
 *  - default                    → primary
 * Espessura aumentada para ~2px no repouso e ~2.75px em seleção,
 * atendendo o critério FB-10.3.1 de "edges claramente visíveis".
 */
import type { Edge, EdgeMarker } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

function color(handle: string | null | undefined): string {
  if (handle === "true") return "oklch(0.6 0.18 145)";
  if (handle === "false") return "oklch(0.58 0.22 25)";
  return "var(--color-primary)";
}

export function styleEdge(
  edge: Edge,
  opts: { selected?: boolean } = {},
): Edge {
  const stroke = color(edge.sourceHandle);
  const selected = Boolean(opts.selected);
  const width = selected ? 2.75 : 2;
  const marker: EdgeMarker = {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: stroke,
  };
  return {
    ...edge,
    type: "smoothstep",
    animated: false,
    style: {
      stroke: `color-mix(in oklab, ${stroke} ${selected ? 100 : 85}%, transparent)`,
      strokeWidth: width,
    },
    markerEnd: marker,
  };
}

