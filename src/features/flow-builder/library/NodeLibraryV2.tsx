/**
 * FB-05 — Node Library V2 (sidebar).
 *
 * Reconstrói a biblioteca lateral:
 *  - alimentada 100% pelo Registry (nenhuma lista manual);
 *  - busca instantânea (label + aliases + keywords + categoria);
 *  - seções Favoritos → Recentes → Mais utilizados → Grupos;
 *  - hover mostra pré-visualização flutuante;
 *  - drag & drop e clique inserem via `insertBlock` (inserção inteligente
 *    com origem = nó selecionado, quando houver);
 *  - atalho `/` foca a busca (fluxo sem mouse), Cmd/Ctrl+K abre palette.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Command, Search, Sparkles } from "lucide-react";
import { blockRegistry } from "../blocks/registry";
import { useSelectedNodeId } from "../state/selectors";
import { BlockRow } from "./BlockRow";
import { BlockPreviewCard } from "./PreviewCard";
import { useLibrary } from "./context";
import { insertBlock } from "./insert";
import { toggleFavorite, usePrefs } from "./preferences";
import { groupItems, rankLibrary, toLibraryItem, type LibraryItem } from "./search";

export function NodeLibraryV2() {
  const [q, setQ] = useState("");
  const [hoverKind, setHoverKind] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const prefs = usePrefs();
  const selectedId = useSelectedNodeId();
  const { openPalette } = useLibrary();

  // atalho "/" foca a busca quando o foco não está em input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allItems = useMemo<LibraryItem[]>(
    () => blockRegistry.list().map(toLibraryItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const filtered = useMemo(() => {
    if (!q.trim()) return null;
    return rankLibrary(allItems, q, {
      favorites: prefs.favorites,
      recents: prefs.recents,
      usage: prefs.usage,
    });
  }, [q, allItems, prefs]);

  const grouped = useMemo(() => groupItems(allItems), [allItems]);
  const byKind = useMemo(() => {
    const m = new Map<string, LibraryItem>();
    for (const it of allItems) m.set(it.kind, it);
    return m;
  }, [allItems]);

  const favorites = useMemo(
    () => [...prefs.favorites].map((k) => byKind.get(k)).filter((x): x is LibraryItem => !!x),
    [prefs.favorites, byKind],
  );
  const recents = useMemo(
    () => prefs.recents.map((k) => byKind.get(k)).filter((x): x is LibraryItem => !!x),
    [prefs.recents, byKind],
  );
  const mostUsed = useMemo(() => {
    const ranked = Object.entries(prefs.usage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => byKind.get(k))
      .filter((x): x is LibraryItem => !!x);
    return ranked;
  }, [prefs.usage, byKind]);

  const onSelect = (kind: string) => {
    insertBlock(kind, { sourceNodeId: selectedId ?? null });
  };
  const onFav = (kind: string) => toggleFavorite(kind);

  const hoverItem = hoverKind ? byKind.get(hoverKind) : null;

  return (
    <aside className="fbv2-lib" aria-label="Biblioteca de blocos">
      <div className="fbv2-lib__head">
        <div className="fbv2-lib__search">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar bloco…"
            aria-label="Buscar bloco"
            className="fbv2-lib__search-input"
          />
          <kbd className="fbv2-lib__kbd">/</kbd>
        </div>
        <button
          type="button"
          className="fbv2-lib__palette-btn"
          onClick={() => openPalette()}
          title="Abrir palette (Ctrl/⌘ + K)"
        >
          <Command className="h-3 w-3" />
          <span>Palette</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      <div className="fbv2-lib__scroll">
        {filtered ? (
          <Section title={`Resultados (${filtered.length})`}>
            {filtered.length === 0 ? (
              <p className="fbv2-lib__empty">
                Nada encontrado. Tente “mensagem”, “imagem”, “IA” ou “condição”.
              </p>
            ) : (
              filtered.map((it) => (
                <BlockRow
                  key={it.kind}
                  item={it}
                  isFavorite={prefs.favorites.has(it.kind)}
                  onSelect={onSelect}
                  onToggleFavorite={onFav}
                  onHover={setHoverKind}
                />
              ))
            )}
          </Section>
        ) : (
          <>
            {favorites.length > 0 && (
              <Section title="Favoritos" icon={<Sparkles className="h-3 w-3" />}>
                {favorites.map((it) => (
                  <BlockRow
                    key={`f-${it.kind}`}
                    item={it}
                    isFavorite
                    onSelect={onSelect}
                    onToggleFavorite={onFav}
                    onHover={setHoverKind}
                  />
                ))}
              </Section>
            )}
            {recents.length > 0 && (
              <Section title="Recentes">
                {recents.map((it) => (
                  <BlockRow
                    key={`r-${it.kind}`}
                    item={it}
                    isFavorite={prefs.favorites.has(it.kind)}
                    onSelect={onSelect}
                    onToggleFavorite={onFav}
                    onHover={setHoverKind}
                  />
                ))}
              </Section>
            )}
            {mostUsed.length > 0 && (
              <Section title="Mais utilizados">
                {mostUsed.map((it) => (
                  <BlockRow
                    key={`u-${it.kind}`}
                    item={it}
                    isFavorite={prefs.favorites.has(it.kind)}
                    onSelect={onSelect}
                    onToggleFavorite={onFav}
                    onHover={setHoverKind}
                  />
                ))}
              </Section>
            )}
            {grouped.map(({ group, items }) => (
              <Section key={group} title={group} count={items.length}>
                {items.map((it) => (
                  <BlockRow
                    key={`${group}-${it.kind}`}
                    item={it}
                    isFavorite={prefs.favorites.has(it.kind)}
                    onSelect={onSelect}
                    onToggleFavorite={onFav}
                    onHover={setHoverKind}
                  />
                ))}
              </Section>
            ))}
          </>
        )}
      </div>

      {hoverItem && (
        <div className="fbv2-lib__hover">
          <BlockPreviewCard item={hoverItem} />
        </div>
      )}
    </aside>
  );
}

function Section({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="fbv2-lib__section">
      <button
        type="button"
        className="fbv2-lib__section-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {icon}
        <span>{title}</span>
        {typeof count === "number" && <span className="fbv2-lib__section-count">{count}</span>}
      </button>
      {open && <div className="fbv2-lib__section-body">{children}</div>}
    </div>
  );
}
