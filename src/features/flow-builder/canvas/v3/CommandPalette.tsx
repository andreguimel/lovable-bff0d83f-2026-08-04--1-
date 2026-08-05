/**
 * FB-13.5 — Command Palette (⌘K).
 *
 * Paleta rápida global do canvas: busca fuzzy por kind/label/descrição,
 * navegação por teclado (↑ ↓ Enter Esc), agrupamento por categoria V3.
 *
 * Regras de inserção (delega a `insertBlock`):
 *  - Se exatamente 1 nó estiver selecionado → insere já conectado a partir
 *    dele (handle default).
 *  - Caso contrário → insere no centro do viewport atual (coordenadas de
 *    fluxo via `screenToFlowPosition`).
 *
 * Não altera runtime nem persistência — puramente UX.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Command, CornerDownLeft, Search } from "lucide-react";
import { useReactFlow } from "@xyflow/react";

import { blockRegistry } from "../../blocks/registry";
import type { BlockDefinition } from "../../blocks/types";
import { insertBlock } from "../../library/insert";
import {
  HIDDEN_KINDS,
  V3_LIBRARY_CATEGORIES,
} from "../../library/v3/categories";
import { useBuilderStore } from "../../state/store";
import { displayKindLabel, resolveCategoryV3 } from "./tokens";

interface Entry {
  def: BlockDefinition;
  categoryId: string;
  categoryLabel: string;
  label: string;
  description: string;
  haystack: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const rf = useReactFlow();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const catById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of V3_LIBRARY_CATEGORIES) m.set(c.id, c.label);
    return m;
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const def of blockRegistry.list()) {
      if (HIDDEN_KINDS.has(def.kind)) continue;
      const catId = resolveCategoryV3(def.kind, def.meta.category);
      const label = displayKindLabel(def.kind, def.meta.short ?? def.meta.label);
      const description = def.meta.label && def.meta.label !== label ? def.meta.label : "";
      out.push({
        def,
        categoryId: catId,
        categoryLabel: catById.get(catId) ?? catId,
        label,
        description,
        haystack: normalize(`${label} ${description} ${def.kind} ${catById.get(catId) ?? ""}`),
      });
    }
    return out;
  }, [catById]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return entries;
    const tokens = q.split(/\s+/).filter(Boolean);
    return entries.filter((e) => tokens.every((t) => e.haystack.includes(t)));
  }, [entries, query]);

  // reset ao abrir/fechar
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // scroll do item ativo à vista
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (entry: Entry | undefined) => {
    if (!entry) return;
    const store = useBuilderStore.getState();
    const sel = store.selection.nodeIds;
    const sourceNodeId = sel.length === 1 ? sel[0] : undefined;

    let position: { x: number; y: number } | undefined;
    if (!sourceNodeId) {
      // centro do viewport atual em coordenadas de fluxo
      const wrap = document.querySelector<HTMLElement>(".fbv2-canvas");
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        position = rf.screenToFlowPosition({
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        });
      }
    }

    const newId = insertBlock(entry.def.kind, { sourceNodeId, position });
    if (newId) {
      useBuilderStore.getState().selectNode(newId);
    }
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // agrupamento visual (mantém ordem de filtered)
  const grouped = useMemo(() => {
    const groups: Array<{ id: string; label: string; items: Array<{ e: Entry; idx: number }> }> = [];
    const byId = new Map<string, { id: string; label: string; items: Array<{ e: Entry; idx: number }> }>();
    filtered.forEach((e, idx) => {
      let g = byId.get(e.categoryId);
      if (!g) {
        g = { id: e.categoryId, label: e.categoryLabel, items: [] };
        byId.set(e.categoryId, g);
        groups.push(g);
      }
      g.items.push({ e, idx });
    });
    return groups;
  }, [filtered]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fbv3-cmdk-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="fbv3-cmdk"
            role="dialog"
            aria-label="Paleta de comandos"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fbv3-cmdk__head">
              <Search className="h-4 w-4 fbv3-cmdk__search" />
              <input
                ref={inputRef}
                className="fbv3-cmdk__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Buscar bloco por nome, categoria…"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="fbv3-kbd fbv3-cmdk__esc">Esc</kbd>
            </div>

            <div className="fbv3-cmdk__list" ref={listRef}>
              {grouped.length === 0 ? (
                <div className="fbv3-cmdk__empty">
                  Nenhum bloco encontrado para "<b>{query}</b>".
                </div>
              ) : (
                grouped.map((g) => (
                  <div key={g.id} className="fbv3-cmdk__group">
                    <div className="fbv3-cmdk__grouphead">{g.label}</div>
                    {g.items.map(({ e, idx }) => {
                      const Icon = e.def.meta.icon;
                      const accent = e.def.meta.accent;
                      const isActive = idx === active;
                      return (
                        <button
                          type="button"
                          key={e.def.kind}
                          data-idx={idx}
                          className={`fbv3-cmdk__row${isActive ? " is-active" : ""}`}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => commit(e)}
                        >
                          <span
                            className="fbv3-cmdk__icon"
                            style={{ "--fbv3-cat-color": accent } as React.CSSProperties}
                          >
                            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                          </span>
                          <span className="fbv3-cmdk__body">
                            <span className="fbv3-cmdk__label">{e.label}</span>
                            {e.description ? (
                              <span className="fbv3-cmdk__desc">{e.description}</span>
                            ) : null}
                          </span>
                          <span className="fbv3-cmdk__cat">{e.categoryLabel}</span>
                          {isActive ? (
                            <CornerDownLeft className="h-3 w-3 fbv3-cmdk__enter" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="fbv3-cmdk__foot">
              <span className="fbv3-cmdk__hint">
                <kbd className="fbv3-kbd">↑</kbd>
                <kbd className="fbv3-kbd">↓</kbd> navegar
              </span>
              <span className="fbv3-cmdk__hint">
                <kbd className="fbv3-kbd">↵</kbd> inserir
              </span>
              <span className="fbv3-cmdk__hint fbv3-cmdk__hint--brand">
                <Command className="h-3 w-3" /> Flow Builder
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
