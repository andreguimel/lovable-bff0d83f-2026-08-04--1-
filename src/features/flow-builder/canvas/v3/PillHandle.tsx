/**
 * FB-10.1 — PillHandle
 *
 * Wrapper do `Handle` do React Flow com identidade visual V3:
 *  - área de clique grande (mesmo com zoom reduzido);
 *  - indicador direcional em handles source;
 *  - herda a cor da categoria do card (via CSS var --fbv3-cat-color).
 *
 * Não altera IDs de handle nem semântica de conexão. É apenas visual.
 */
import { Handle, Position, type HandleType } from "@xyflow/react";

export interface PillHandleProps {
  type: HandleType; // "source" | "target"
  position: Position;
  id?: string;
  connected?: boolean;
  style?: React.CSSProperties;
}

export function PillHandle({ type, position, id, connected, style }: PillHandleProps) {
  const cls = [
    "fbv3-handle",
    type === "source" ? "fbv3-handle--source" : "fbv3-handle--target",
  ].join(" ");
  return (
    <Handle
      type={type}
      position={position}
      id={id}
      className={cls}
      data-connected={connected ? "true" : "false"}
      style={style}
    />
  );
}
