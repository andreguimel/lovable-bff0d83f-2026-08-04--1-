/**
 * FB-10.1 · FB-10.3.1 — SoftCurvedEdge
 *
 * Edge type customizado do React Flow com curvas suaves (Bezier de
 * curvatura moderada) e marker sólido bem visível. Semântica idêntica
 * à edge padrão — só muda a apresentação. Nenhum campo persistido é
 * alterado.
 *
 * FB-10.3.1 aumentou o peso visual das edges V3 para corrigir a
 * queixa de "conexões fracas". Continuam contínuas (não tracejadas)
 * e ganham hover/seleção mais óbvios via CSS `.fbv3-edge`.
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { Clock, X } from "lucide-react";
import { useBuilderStore } from "../../state/store";
import { resolveEdgeLabel, edgeLabelTone } from "./tokens";

/** Formata ms → "500ms" / "3s" / "2m" / "1h" para o badge de Smart Transition Delay. */
function formatDelay(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${Math.round(ms / 100) / 10}s`.replace(".0", "");
  if (ms < 3_600_000) return `${Math.round(ms / 6000) / 10}m`.replace(".0", "");
  return `${Math.round(ms / 360_000) / 10}h`.replace(".0", "");
}

function strokeFor(handle: string | null | undefined): string {
  if (handle === "true" || handle === "yes") return "oklch(0.7 0.18 145)";
  if (handle === "false" || handle === "no" || handle === "invalid") return "oklch(0.66 0.22 25)";
  return "oklch(0.72 0.19 262)";
}

// Cor secundária do gradiente — puxa pro violet/indigo, cria transição luminosa.
function stroke2For(handle: string | null | undefined): string {
  if (handle === "true" || handle === "yes") return "oklch(0.76 0.15 195)";
  if (handle === "false" || handle === "no" || handle === "invalid") return "oklch(0.72 0.19 32)";
  return "oklch(0.76 0.15 195)";
}

export function SoftCurvedEdge(props: EdgeProps) {
  const {
    id,
    source,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    sourceHandleId,
    data,
  } = props;

  const rf = useReactFlow();

  const [path, labelXRaw, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.3,
  });

  const stroke = strokeFor(sourceHandleId);
  const stroke2 = stroke2For(sourceHandleId);
  const width = selected ? 2.75 : 2;
  const markerId = `fbv3-arrow-${id}`;
  const gradId = `fbv3-grad-${id}`;

  // FB-12.5 — label derivada da fonte canônica: options[] / routes[] no nó de origem.
  const sourceNode = rf.getNode(source);
  const sourceData = (sourceNode?.data as Record<string, unknown> | undefined) ?? undefined;
  const sourceKind = ((sourceData as { __kind?: string } | undefined)?.__kind) ?? "";
  const label = resolveEdgeLabel(sourceKind, sourceData, sourceHandleId);
  const tone = edgeLabelTone(sourceKind, sourceHandleId);

  // FB-12.5 — ancora a label no PRIMEIRO TERÇO da edge (perto da origem),
  // deixando o meio livre para o botão `+` do add-on-handle (FB-12.4)
  // e para o hit-area de seleção da edge.
  const labelX = sourceX + (labelXRaw - sourceX) * 0.35;
  const labelYAnchored = sourceY + (labelY - sourceY) * 0.35;

  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={stroke} />
          <stop offset="100%" stopColor={stroke2} />
        </linearGradient>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke2} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        className={`fbv3-edge${selected ? " fbv3-edge--selected" : ""}`}
        markerEnd={`url(#${markerId})`}
        style={{ stroke: `url(#${gradId})`, strokeWidth: width, fill: "none", color: stroke2 }}
      />
      {/* Hit-area invisível — facilita clicar/selecionar a edge para excluir. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        className="fbv3-edge__hit"
        style={{ cursor: "pointer" }}
      />
      {selected ? (
        <circle r={3} fill={stroke2} className="fbv3-edge__particle">
          <animateMotion dur="1.6s" repeatCount="indefinite" path={path} rotate="auto" />
        </circle>
      ) : null}
      {selected ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="fbv3-edge__delete"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelXRaw}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onClick={(e) => {
              e.stopPropagation();
              useBuilderStore.getState().disconnect(id);
            }}
            title="Excluir conexão (ou pressione Delete)"
            aria-label="Excluir conexão"
          >
            <X className="h-3 w-3" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`fbv3-edge__label fbv3-edge__label--${tone}`}
            data-edge-id={id}
            data-source-handle={sourceHandleId ?? ""}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelYAnchored}px)`,
              pointerEvents: "none",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {(() => {
        // FB-V1.2 · Smart Transition Delay — badge central "⏱ Xs" quando delay > 0.
        const delay = Math.max(0, Number((data as { transitionDelayMs?: number } | undefined)?.transitionDelayMs ?? 0) || 0);
        if (!delay) return null;
        return (
          <EdgeLabelRenderer>
            <button
              type="button"
              className={`fbv3-edge__delay${selected ? " fbv3-edge__delay--selected" : ""}`}
              data-edge-id={id}
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelXRaw}px, ${labelY - 18}px)`,
                pointerEvents: "all",
              }}
              onClick={(e) => {
                e.stopPropagation();
                useBuilderStore.getState().selectEdge(id);
              }}
              title={`Atraso na transição: ${formatDelay(delay)}`}
              aria-label={`Atraso na transição: ${formatDelay(delay)}`}
            >
              <Clock className="h-3 w-3" />
              <span>{formatDelay(delay)}</span>
            </button>
          </EdgeLabelRenderer>
        );
      })()}
    </>
  );
}
