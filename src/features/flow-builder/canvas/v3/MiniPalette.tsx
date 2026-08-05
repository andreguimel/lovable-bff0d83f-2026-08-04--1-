/**
 * FB-12.4 — Mini-palette contextual do Add-on-handle.
 *
 * Popover flutuante ancorado no botão `+` de uma saída do bloco.
 * Reaproveita o Registry como fonte canônica (nenhuma lista hardcoded)
 * e aplica a mesma taxonomia de categorias V3 usada na NodeLibraryPanelV3.
 * Ao selecionar um bloco, delega a criação ao `insertBlock` de FB-05,
 * garantindo que sourceHandle e sourceNodeId sejam preservados.
 *
 * Fechamento: clique fora, Esc ou seleção.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { blockRegistry } from "../../blocks/registry";
import type { BlockDefinition } from "../../blocks/types";
import { insertBlock } from "../../library/insert";
import {
  HIDDEN_KINDS,
  V3_LIBRARY_CATEGORIES,
} from "../../library/v3/categories";
import { readPrefs, topUsed } from "../../library/preferences";
import { resolveCategoryV3, displayKindLabel } from "./tokens";

export interface MiniPaletteAnchor {
  x: number;
  y: number;
  /** Altura do elemento âncora para deslocar o popover verticalmente. */
  height?: number;
}

export interface MiniPaletteProps {
  anchor: MiniPaletteAnchor;
  sourceNodeId: string;
  sourceHandle: string | null;
  onClose: () => void;
  onInserted?: (newNodeId: string, kind: string) => void;
}

interface Grouped {
  categoryId: string;
  categoryLabel: string;
  blocks: BlockDefinition[];
}

const PANEL_W = 280;
const PANEL_MAX_H = 380;
const MARGIN = 8;

function groupByCategory(defs: BlockDefinition[]): Grouped[] {
  const buckets = new Map<string, BlockDefinition[]>();
  for (const def of defs) {
    const cat = resolveCategoryV3(def.kind, def.meta.category);
    const arr = buckets.get(cat) ?? [];
    arr.push(def);
    buckets.set(cat, arr);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.meta.label.localeCompare(b.meta.label, "pt-BR"));
  }
  return V3_LIBRARY_CATEGORIES.filter((c) => (buckets.get(c.id)?.length ?? 0) > 0).map(
    (category) => ({
      categoryId: category.id,
      categoryLabel: category.label,
      blocks: buckets.get(category.id) ?? [],
    }),
  );
}

export function MiniPalette({
  anchor,
  sourceNodeId,
  sourceHandle,
  onClose,
  onInserted,
}: MiniPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  // Focus search on open.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Position within viewport (flip if overflow).
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.x + MARGIN;
    let top = anchor.y - 12;
    if (left + PANEL_W + MARGIN > vw) left = Math.max(MARGIN, anchor.x - PANEL_W - MARGIN);
    const rect = panelRef.current?.getBoundingClientRect();
    const h = rect?.height ?? PANEL_MAX_H;
    if (top + h + MARGIN > vh) top = Math.max(MARGIN, vh - h - MARGIN);
    setPos({ left, top });
  }, [anchor.x, anchor.y, query]);

  // Close on Esc + click outside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const grouped = useMemo(() => {
    const all = blockRegistry.list().filter((d) => !HIDDEN_KINDS.has(d.kind));
    if (!query.trim()) return groupByCategory(all);
    const q = query.trim().toLowerCase();
    const filtered = all.filter((d) => {
      const label = d.meta.label.toLowerCase();
      const short = (d.meta.short ?? "").toLowerCase();
      return label.includes(q) || short.includes(q) || d.kind.toLowerCase().includes(q);
    });
    return groupByCategory(filtered);
  }, [query]);

  const recents = useMemo(() => {
    if (query.trim()) return [];
    try {
      const prefs = readPrefs();
      const top = topUsed(prefs.usage, 5);
      return top
        .map((k) => blockRegistry.get(k))
        .filter((d): d is BlockDefinition => Boolean(d && !HIDDEN_KINDS.has(d.kind)));
    } catch {
      return [];
    }
  }, [query]);

  const pick = (kind: string) => {
    const newId = insertBlock(kind, {
      sourceNodeId,
      sourceHandle: sourceHandle ?? null,
    });
    if (newId) onInserted?.(newId, kind);
    onClose();
  };

  const content = (
    <div
      ref={panelRef}
      className="fbv3-mini-palette nodrag nopan"
      role="dialog"
      aria-label="Adicionar próximo bloco"
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: PANEL_W,
        maxHeight: PANEL_MAX_H,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="fbv3-mini-palette__search">
        <Search className="h-3.5 w-3.5 opacity-60" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Buscar bloco…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const first = grouped[0]?.blocks[0];
              if (first) pick(first.kind);
            }
          }}
        />
      </div>

      <div className="fbv3-mini-palette__list">
        {recents.length > 0 && (
          <div className="fbv3-mini-palette__group">
            <div className="fbv3-mini-palette__group-label">Recentes</div>
            {recents.map((d) => (
              <PaletteRow key={`r-${d.kind}`} def={d} onPick={pick} />
            ))}
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.categoryId} className="fbv3-mini-palette__group">
            <div className="fbv3-mini-palette__group-label">{g.categoryLabel}</div>
            {g.blocks.map((d) => (
              <PaletteRow key={d.kind} def={d} onPick={pick} />
            ))}
          </div>
        ))}

        {grouped.length === 0 && recents.length === 0 && (
          <div className="fbv3-mini-palette__empty">Nenhum bloco encontrado.</div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}

function PaletteRow({
  def,
  onPick,
}: {
  def: BlockDefinition;
  onPick: (kind: string) => void;
}) {
  const Icon = def.meta.icon;
  const kindLabel = displayKindLabel(def.kind, def.meta.short ?? def.meta.label);
  return (
    <button
      type="button"
      className="fbv3-mini-palette__row"
      onClick={(e) => {
        e.stopPropagation();
        onPick(def.kind);
      }}
      data-kind={def.kind}
    >
      <span className="fbv3-mini-palette__row-icon" aria-hidden>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="fbv3-mini-palette__row-body">
        <span className="fbv3-mini-palette__row-title">{def.meta.label}</span>
        <span className="fbv3-mini-palette__row-kind">{kindLabel}</span>
      </span>
    </button>
  );
}
