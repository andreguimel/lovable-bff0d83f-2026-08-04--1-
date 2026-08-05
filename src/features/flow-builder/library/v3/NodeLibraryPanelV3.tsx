/**
 * FB-10.2 — NodeLibraryPanelV3
 *
 * Paleta lateral visual, permanente e orientada por categorias.
 *
 * Consome o Registry (única fonte de verdade) e reaproveita 100% da
 * infraestrutura da Library V2:
 *   - busca:            `rankLibrary` + `toLibraryItem`
 *   - inserção:         `insertBlock` (clique, drag&drop, seleção)
 *   - drag-and-drop:    mime `application/x-flow-block`
 *   - Command Palette:  continua acessível via `useLibrary().openPalette`
 *   - Preferências:     `usePrefs` (favoritos/recentes/uso)
 *
 * Não cria novo motor de busca nem novo estado — apenas uma nova camada
 * de experiência visual V3 por cima.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Command,
  History,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { blockRegistry } from "../../blocks/registry";
import { useSelectedNodeId } from "../../state/selectors";
import { useLibrary } from "../context";
import { insertBlock } from "../insert";
import { toggleFavorite, usePrefs } from "../preferences";
import { rankLibrary, toLibraryItem, type LibraryItem } from "../search";
import type { BlockDefinition } from "../../blocks/types";
import {
  categorizeBlocks,
  V3_LIBRARY_CATEGORIES,
  V3_PANEL_META,
  type LibraryCategoryV3,
} from "./categories";

const STORAGE_KEY = "flow-builder.v3.library.collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* silencioso */
  }
}

export function NodeLibraryPanelV3() {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [activeCat, setActiveCat] = useState<LibraryCategoryV3["id"] | "all">("all");
  const [hovered, setHovered] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const prefs = usePrefs();
  const selectedId = useSelectedNodeId();
  const { openPalette } = useLibrary();

  const allDefs = useMemo<BlockDefinition[]>(() => blockRegistry.list(), []);
  const categorized = useMemo(() => categorizeBlocks(allDefs), [allDefs]);

  const byKind = useMemo(() => {
    const m = new Map<string, BlockDefinition>();
    for (const d of allDefs) m.set(d.kind, d);
    return m;
  }, [allDefs]);

  const allItems = useMemo<LibraryItem[]>(
    () => allDefs.map(toLibraryItem),
    [allDefs],
  );

  const searching = q.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return null;
    return rankLibrary(allItems, q, {
      favorites: prefs.favorites,
      recents: prefs.recents,
      usage: prefs.usage,
    });
  }, [searching, q, allItems, prefs]);

  // Atalho "/" para focar a busca (mantém paridade com Library V2).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      setCollapsed(false);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleInsert = (kind: string) => {
    insertBlock(kind, { sourceNodeId: selectedId ?? null });
  };

  const onToggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  };

  // Recentes / Favoritos como atalhos superiores (só quando NÃO buscando).
  const favorites = useMemo(
    () =>
      [...prefs.favorites]
        .map((k) => byKind.get(k))
        .filter((d): d is BlockDefinition => !!d && !isHidden(d.kind)),
    [prefs.favorites, byKind],
  );
  const recents = useMemo(
    () =>
      prefs.recents
        .map((k) => byKind.get(k))
        .filter((d): d is BlockDefinition => !!d && !isHidden(d.kind))
        .slice(0, 4),
    [prefs.recents, byKind],
  );

  const visibleCats = useMemo(() => {
    if (activeCat === "all") return categorized;
    return categorized.filter((c) => c.category.id === activeCat);
  }, [categorized, activeCat]);

  if (collapsed) {
    return (
      <aside className="fbv3-lib fbv3-lib--collapsed" aria-label="Biblioteca de blocos (recolhida)">
        <button
          type="button"
          className="fbv3-lib__collapse-btn"
          onClick={onToggleCollapsed}
          title="Expandir biblioteca"
          aria-label="Expandir biblioteca"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="fbv3-lib__rail">
          {V3_LIBRARY_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                className="fbv3-lib__rail-btn"
                data-cat={cat.id}
                data-disabled={cat.comingSoon ? "true" : "false"}
                onClick={() => {
                  setCollapsed(false);
                  writeCollapsed(false);
                  setActiveCat(cat.id);
                }}
                title={cat.comingSoon ? `${cat.label} — Em breve` : cat.label}
                aria-label={cat.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  const connectMode = Boolean(selectedId);

  return (
    <aside
      className="fbv3-lib"
      aria-label="Biblioteca de blocos"
      data-connect-mode={connectMode ? "true" : "false"}
    >
      <header className="fbv3-lib__header">
        <div className="fbv3-lib__title-row">
          <div className="fbv3-lib__title">
            <span>{V3_PANEL_META.title}</span>
          </div>
          <button
            type="button"
            className="fbv3-lib__collapse-btn"
            onClick={onToggleCollapsed}
            title="Recolher biblioteca"
            aria-label="Recolher biblioteca"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
        <p className="fbv3-lib__subtitle">{V3_PANEL_META.subtitle}</p>

        <div className="fbv3-lib__search">
          <Search className="h-3.5 w-3.5" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar bloco (mensagem, IA, delay…)"
            aria-label="Buscar bloco"
          />
          {q ? (
            <button
              type="button"
              className="fbv3-lib__search-clear"
              onClick={() => setQ("")}
              aria-label="Limpar busca"
              title="Limpar"
            >
              <X className="h-3 w-3" />
            </button>
          ) : (
            <kbd className="fbv3-lib__kbd">/</kbd>
          )}
        </div>

        <button
          type="button"
          className="fbv3-lib__palette"
          onClick={() => openPalette()}
          title="Abrir Command Palette (Ctrl/⌘ + K)"
        >
          <Command className="h-3 w-3" />
          <span>Command Palette</span>
          <kbd>⌘K</kbd>
        </button>

        {!searching && (
          <div className="fbv3-lib__catbar" role="tablist" aria-label="Categorias">
            <button
              type="button"
              role="tab"
              aria-selected={activeCat === "all"}
              className="fbv3-lib__catchip"
              data-active={activeCat === "all" ? "true" : "false"}
              onClick={() => setActiveCat("all")}
            >
              Tudo
            </button>
            {V3_LIBRARY_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={activeCat === cat.id}
                className="fbv3-lib__catchip"
                data-cat={cat.id}
                data-active={activeCat === cat.id ? "true" : "false"}
                onClick={() => setActiveCat(cat.id)}
                title={cat.description}
              >
                <cat.icon className="h-3 w-3" />
                <span>{cat.label}</span>
                {cat.comingSoon && <span className="fbv3-lib__soon">Em breve</span>}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="fbv3-lib__scroll">
        {searching ? (
          <SearchResults
            results={searchResults ?? []}
            byKind={byKind}
            favorites={prefs.favorites}
            hovered={hovered}
            onHover={setHovered}
            onInsert={handleInsert}
            onFav={toggleFavorite}
          />
        ) : (
          <>
            {favorites.length > 0 && (
              <Section
                title="Favoritos"
                icon={<Star className="h-3 w-3" />}
                tone="favorites"
              >
                {favorites.map((d) => (
                  <BlockCardMini
                    key={`fav-${d.kind}`}
                    def={d}
                    isFavorite
                    onInsert={handleInsert}
                    onFav={toggleFavorite}
                    onHover={setHovered}
                  />
                ))}
              </Section>
            )}
            {recents.length > 0 && (
              <Section
                title="Recentes"
                icon={<History className="h-3 w-3" />}
                tone="recents"
              >
                {recents.map((d) => (
                  <BlockCardMini
                    key={`rec-${d.kind}`}
                    def={d}
                    isFavorite={prefs.favorites.has(d.kind)}
                    onInsert={handleInsert}
                    onFav={toggleFavorite}
                    onHover={setHovered}
                  />
                ))}
              </Section>
            )}

            {visibleCats.map(({ category, blocks }) => (
              <CategorySection
                key={category.id}
                category={category}
                blocks={blocks}
                favorites={prefs.favorites}
                onInsert={handleInsert}
                onFav={toggleFavorite}
                onHover={setHovered}
              />
            ))}
          </>
        )}
      </div>

      <footer className="fbv3-lib__footer">
        <span className="fbv3-lib__footer-hint">
          <Sparkles className="h-3 w-3" />
          {connectMode
            ? "Bloco selecionado — clique em outro para conectar em seguida."
            : "Arraste o bloco ou clique para inserir. Selecione um nó antes para encadear."}
        </span>
      </footer>
    </aside>
  );
}

function isHidden(kind: string): boolean {
  return kind === "start";
}

// ------------------------------------------------------------------
// Subcomponentes
// ------------------------------------------------------------------
function Section({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: "favorites" | "recents";
  children: React.ReactNode;
}) {
  return (
    <section className="fbv3-lib__section" data-tone={tone ?? ""}>
      <header className="fbv3-lib__section-head">
        {icon}
        <span>{title}</span>
      </header>
      <div className="fbv3-lib__section-body">{children}</div>
    </section>
  );
}

function CategorySection({
  category,
  blocks,
  favorites,
  onInsert,
  onFav,
  onHover,
}: {
  category: LibraryCategoryV3;
  blocks: BlockDefinition[];
  favorites: Set<string>;
  onInsert: (kind: string) => void;
  onFav: (kind: string) => void;
  onHover: (kind: string | null) => void;
}) {
  const Icon = category.icon;
  const empty = blocks.length === 0;
  return (
    <section className="fbv3-lib__cat" data-cat={category.id}>
      <header className="fbv3-lib__cat-head">
        <span className="fbv3-lib__cat-icon" aria-hidden>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="fbv3-lib__cat-titles">
          <p className="fbv3-lib__cat-title">{category.label}</p>
          <p className="fbv3-lib__cat-desc">{category.description}</p>
        </div>
        {category.comingSoon && <span className="fbv3-lib__soon">Em breve</span>}
      </header>
      <div className="fbv3-lib__cat-body">
        {empty ? (
          <div className="fbv3-lib__empty-cat">
            {category.comingSoonNote ??
              "Nenhum bloco disponível nesta categoria ainda."}
          </div>
        ) : (
          blocks.map((d) => (
            <BlockCardMini
              key={d.kind}
              def={d}
              isFavorite={favorites.has(d.kind)}
              onInsert={onInsert}
              onFav={onFav}
              onHover={onHover}
            />
          ))
        )}
      </div>
    </section>
  );
}

function SearchResults({
  results,
  byKind,
  favorites,
  hovered: _hovered,
  onHover,
  onInsert,
  onFav,
}: {
  results: LibraryItem[];
  byKind: Map<string, BlockDefinition>;
  favorites: Set<string>;
  hovered: string | null;
  onHover: (k: string | null) => void;
  onInsert: (kind: string) => void;
  onFav: (kind: string) => void;
}) {
  const visible = results.filter((r) => !isHidden(r.kind));
  return (
    <section className="fbv3-lib__section" data-tone="search">
      <header className="fbv3-lib__section-head">
        <Search className="h-3 w-3" />
        <span>Resultados ({visible.length})</span>
      </header>
      <div className="fbv3-lib__section-body">
        {visible.length === 0 ? (
          <div className="fbv3-lib__empty-cat">
            Nada encontrado. Tente “mensagem”, “delay”, “IA” ou “condição”.
          </div>
        ) : (
          visible.map((it) => {
            const def = byKind.get(it.kind);
            if (!def) return null;
            return (
              <BlockCardMini
                key={`res-${it.kind}`}
                def={def}
                isFavorite={favorites.has(it.kind)}
                onInsert={onInsert}
                onFav={onFav}
                onHover={onHover}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function BlockCardMini({
  def,
  isFavorite,
  onInsert,
  onFav,
  onHover,
}: {
  def: BlockDefinition;
  isFavorite: boolean;
  onInsert: (kind: string) => void;
  onFav: (kind: string) => void;
  onHover: (kind: string | null) => void;
}) {
  const Icon = def.meta.icon;
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-flow-block", def.kind);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div
      className="fbv3-lib__block"
      role="button"
      tabIndex={0}
      draggable
      data-block-kind={def.kind}
      data-kind={def.kind}
      onDragStart={onDragStart}
      onClick={() => onInsert(def.kind)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onInsert(def.kind);
        }
      }}
      onMouseEnter={() => onHover(def.kind)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(def.kind)}
      onBlur={() => onHover(null)}
      style={{ ["--card-accent" as string]: def.meta.accent }}
      title={def.meta.short}
    >
      <span className="fbv3-lib__block-icon" aria-hidden>
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <div className="fbv3-lib__block-body">
        <p className="fbv3-lib__block-title">{def.meta.label}</p>
        <p className="fbv3-lib__block-short">{def.meta.short}</p>
      </div>
      <button
        type="button"
        className={`fbv3-lib__block-fav${isFavorite ? " fbv3-lib__block-fav--on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onFav(def.kind);
        }}
        aria-label={isFavorite ? "Remover favorito" : "Marcar favorito"}
        title={isFavorite ? "Remover favorito" : "Marcar favorito"}
      >
        <Star className="h-3 w-3" />
      </button>
    </div>
  );
}
