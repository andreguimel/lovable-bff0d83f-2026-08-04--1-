/**
 * FB-12.4 — AddOnHandle
 *
 * Wrapper de `PillHandle` que agrega um botão `+` discreto ao lado da
 * saída, permitindo criar o próximo bloco e conectá-lo automaticamente
 * pelo handle correto. Preserva 100% do comportamento de conexão
 * manual (drag&drop no handle).
 *
 * O botão usa `nodrag nopan` para não conflitar com o React Flow.
 */
import { useCallback, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Position } from "@xyflow/react";
import { PillHandle, type PillHandleProps } from "./PillHandle";
import { MiniPalette, type MiniPaletteAnchor } from "./MiniPalette";

export interface AddOnHandleProps extends PillHandleProps {
  /** ID do nó dono do handle — necessário para conectar. */
  nodeId: string;
  /** Habilita o `+` (default true para source). */
  addOnEnabled?: boolean;
}

export function AddOnHandle(props: AddOnHandleProps) {
  const {
    nodeId,
    addOnEnabled = true,
    id: handleId,
    type,
    position,
    connected,
    style,
  } = props;

  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<MiniPaletteAnchor | null>(null);

  const showAddOn = addOnEnabled && type === "source";

  const openPalette = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      x: rect.right,
      y: rect.top,
      height: rect.height,
    });
  }, []);

  const close = useCallback(() => setAnchor(null), []);

  // Container relativo para posicionar o `+`.
  // Ele "acompanha" o handle usando o mesmo `style` (que carrega o top%
  // vindo do BlockNodeV3 para multi-outputs).
  return (
    <>
      <PillHandle
        type={type}
        position={position}
        id={handleId}
        connected={connected}
        style={style}
      />
      {showAddOn && (
        <button
          ref={btnRef}
          type="button"
          className="fbv3-addon-plus nodrag nopan"
          aria-label="Adicionar próximo bloco"
          title="Adicionar próximo bloco"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={openPalette}
          style={{
            ...(style ?? {}),
            // Deslocamento à direita do handle. Handles source ficam à
            // direita do card, então o botão fica alinhado à direita
            // e um pouco fora.
            right: position === Position.Right ? -34 : undefined,
            left: position === Position.Left ? -34 : undefined,
          }}
          data-handle-id={handleId ?? "out"}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
      {anchor && (
        <MiniPalette
          anchor={anchor}
          sourceNodeId={nodeId}
          sourceHandle={handleId ?? null}
          onClose={close}
        />
      )}
    </>
  );
}
