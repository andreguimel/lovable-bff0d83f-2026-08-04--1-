/**
 * FB-05 — Command Palette (Cmd/Ctrl + K).
 *
 * Diálogo modal que:
 *  - foca a busca imediatamente;
 *  - filtra enquanto o usuário digita (sem Enter, sem botão);
 *  - navega por teclado (setas, Enter, Esc);
 *  - mostra pré-visualização do item destacado;
 *  - insere respeitando o `insertContext` recebido (edge split /
 *    source node / posição explícita).
 *
 * O componente é 100% controlado pelo `LibraryProvider`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { blockRegistry } from "../blocks/registry";
import { BlockRow } from "./BlockRow";
import { BlockPreviewCard } from "./PreviewCard";
import { insertBlock, type InsertContext } from "./insert";
import { usePrefs } from "./preferences";
import { rankLibrary, toLibraryItem } from "./search";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  insertContext?: InsertContext;
  initialQuery?: string;
}

export function CommandPalette({ open, onOpenChange, insertContext, initialQuery }: Props) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prefs = usePrefs();

  const items = useMemo(() => {
    const all = blockRegistry.list().map(toLibraryItem);
    return rankLibrary(all, q, {
      favorites: prefs.favorites,
      recents: prefs.recents,
      usage: prefs.usage,
    });
  }, [q, prefs]);

  useEffect(() => {
    if (open) {
      setQ(initialQuery ?? "");
      setActiveIdx(0);
      // foco após montar
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialQuery]);

  useEffect(() => {
    // se o filtro reduz, mantém dentro do range
    if (activeIdx >= items.length) setActiveIdx(Math.max(0, items.length - 1));
  }, [items.length, activeIdx]);

  const activeItem = items[activeIdx];

  const commit = (kind: string) => {
    const id = insertBlock(kind, insertContext ?? {});
    if (id) onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeItem) commit(activeItem.kind);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 sm:max-w-[720px] overflow-hidden"
        onKeyDown={onKeyDown}
        aria-label="Biblioteca de blocos"
      >
        <div className="fbv2-lib__palette-search">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Buscar bloco… (mensagem, imagem, condição, IA…)"
            className="fbv2-lib__palette-input"
            aria-label="Buscar bloco"
          />
          <kbd className="fbv2-lib__palette-kbd">Esc</kbd>
        </div>

        <div className="fbv2-lib__palette-body">
          <div className="fbv2-lib__palette-list" role="listbox">
            {items.length === 0 ? (
              <p className="fbv2-lib__palette-empty">
                Nada encontrado para “{q}”. Tente “mensagem”, “imagem”, “IA” ou “condição”.
              </p>
            ) : (
              items.map((it, idx) => (
                <BlockRow
                  key={it.kind}
                  item={it}
                  active={idx === activeIdx}
                  isFavorite={prefs.favorites.has(it.kind)}
                  onSelect={commit}
                  onHover={() => setActiveIdx(idx)}
                  compact
                />
              ))
            )}
          </div>
          <div className="fbv2-lib__palette-preview">
            {activeItem ? (
              <BlockPreviewCard item={activeItem} />
            ) : (
              <div className="fbv2-lib__palette-preview-empty">
                Selecione um bloco para ver detalhes.
              </div>
            )}
          </div>
        </div>

        <div className="fbv2-lib__palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>Enter</kbd> inserir
          </span>
          <span>
            <kbd>Esc</kbd> fechar
          </span>
          <span className="fbv2-lib__palette-count">{items.length} bloco(s)</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
