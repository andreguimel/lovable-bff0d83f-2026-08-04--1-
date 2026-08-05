/**
 * FB-05 — Linha padrão de um bloco na Node Library.
 *
 * Componente único usado pelo sidebar e pelo Command Palette. Cobre:
 *  - Drag & Drop (ghost + payload `application/x-flow-block`);
 *  - Clique para inserção (via `onSelect`);
 *  - Toggle de favorito;
 *  - Hover para pré-visualização (via `onHover`).
 *
 * Nenhum bloco cria botão próprio — o card é único e vem do Registry.
 */
import { Star } from "lucide-react";
import type { LibraryItem } from "./search";

interface Props {
  item: LibraryItem;
  active?: boolean;
  isFavorite?: boolean;
  onSelect: (kind: string) => void;
  onToggleFavorite?: (kind: string) => void;
  onHover?: (kind: string) => void;
  /** Renderiza o card em versão compacta (usada no palette). */
  compact?: boolean;
}

export function BlockRow({
  item,
  active,
  isFavorite,
  onSelect,
  onToggleFavorite,
  onHover,
  compact,
}: Props) {
  const Icon = item.def.meta.icon;
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-flow-block", item.kind);
    e.dataTransfer.effectAllowed = "move";
    // ghost image nativo do browser é suficiente; o accent no card garante identidade.
  };
  return (
    <div
      className={[
        "fbv2-lib__row",
        active ? "fbv2-lib__row--active" : "",
        compact ? "fbv2-lib__row--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable
      onDragStart={onDragStart}
      onClick={() => onSelect(item.kind)}
      onMouseEnter={() => onHover?.(item.kind)}
      onFocus={() => onHover?.(item.kind)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSelect(item.kind);
        }
      }}
      style={{ ["--card-accent" as string]: item.def.meta.accent }}
    >
      <span className="fbv2-lib__row-icon">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="fbv2-lib__row-title">{item.def.meta.label}</p>
        <p className="fbv2-lib__row-short">{item.def.meta.short}</p>
      </div>
      {onToggleFavorite && (
        <button
          type="button"
          className={`fbv2-lib__row-fav ${isFavorite ? "fbv2-lib__row-fav--on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(item.kind);
          }}
          aria-label={isFavorite ? "Remover favorito" : "Marcar favorito"}
          title={isFavorite ? "Remover favorito" : "Marcar favorito"}
        >
          <Star className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
