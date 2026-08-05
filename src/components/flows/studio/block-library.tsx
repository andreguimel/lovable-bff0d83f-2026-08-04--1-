import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BLOCKS, CATEGORIES, type BlockCategory, type BlockMeta, type NodeKind } from "./blocks";

const FAV_KEY = "flow-studio.favorites";
const RECENT_KEY = "flow-studio.recent";

function loadStr(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveStr(key: string, arr: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

interface Props {
  onAdd: (kind: NodeKind) => void;
}

export function BlockLibrary({ onAdd }: Props) {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<BlockCategory>>(new Set());
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setFavs(new Set(loadStr(FAV_KEY)));
    setRecent(loadStr(RECENT_KEY));
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return null;
    const term = q.toLowerCase();
    return Object.values(BLOCKS).filter(
      (b) =>
        b.label.toLowerCase().includes(term) ||
        b.short.toLowerCase().includes(term) ||
        b.category.toLowerCase().includes(term),
    );
  }, [q]);

  const toggleFav = (k: NodeKind) => {
    setFavs((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      saveStr(FAV_KEY, [...next]);
      return next;
    });
  };

  const handleAdd = (k: NodeKind) => {
    onAdd(k);
    setRecent((r) => {
      const next = [k, ...r.filter((x) => x !== k)].slice(0, 6);
      saveStr(RECENT_KEY, next);
      return next;
    });
  };

  const onDragStart = (e: React.DragEvent, kind: NodeKind) => {
    e.dataTransfer.setData("application/x-flow-block", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  const toggle = (id: BlockCategory) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="block-library">
      <div className="block-library__search">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar bloco…"
          className="h-8 border-0 bg-transparent px-2 text-xs shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="block-library__scroll">
        {filtered ? (
          <BlockGroup
            title={`Resultados (${filtered.length})`}
            blocks={filtered}
            onAdd={handleAdd}
            onDragStart={onDragStart}
            favs={favs}
            onFav={toggleFav}
          />
        ) : (
          <>
            {favs.size > 0 && (
              <BlockGroup
                title="Favoritos"
                blocks={Object.values(BLOCKS).filter((b) => favs.has(b.kind))}
                onAdd={handleAdd}
                onDragStart={onDragStart}
                favs={favs}
                onFav={toggleFav}
              />
            )}
            {recent.length > 0 && (
              <BlockGroup
                title="Recentes"
                blocks={recent
                  .map((k) => BLOCKS[k as NodeKind])
                  .filter((b): b is BlockMeta => Boolean(b))}
                onAdd={handleAdd}
                onDragStart={onDragStart}
                favs={favs}
                onFav={toggleFav}
              />
            )}
            {CATEGORIES.map((cat) => {
              const blocks = Object.values(BLOCKS).filter((b) => b.category === cat.id);
              if (blocks.length === 0) return null;
              const Icon = cat.icon;
              const isCollapsed = collapsed.has(cat.id);
              return (
                <div key={cat.id} className="block-library__cat">
                  <button
                    type="button"
                    onClick={() => toggle(cat.id)}
                    className="block-library__cat-head"
                  >
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span>{cat.label}</span>
                    <span className="block-library__cat-count">{blocks.length}</span>
                    <ChevronDown
                      className={`ml-auto h-3 w-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    />
                  </button>
                  {!isCollapsed && (
                    <BlockGroup
                      blocks={blocks}
                      onAdd={handleAdd}
                      onDragStart={onDragStart}
                      favs={favs}
                      onFav={toggleFav}
                    />
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}

function BlockGroup({
  title,
  blocks,
  onAdd,
  onDragStart,
  favs,
  onFav,
}: {
  title?: string;
  blocks: BlockMeta[];
  onAdd: (kind: NodeKind) => void;
  onDragStart: (e: React.DragEvent, kind: NodeKind) => void;
  favs: Set<string>;
  onFav: (kind: NodeKind) => void;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="block-library__group">
      {title && <p className="block-library__group-title">{title}</p>}
      <div className="block-library__grid">
        {blocks.map((b) => {
          const Icon = b.icon;
          const active = favs.has(b.kind);
          return (
            <div
              key={b.kind}
              className="block-card"
              draggable
              onDragStart={(e) => onDragStart(e, b.kind)}
              onClick={() => onAdd(b.kind)}
              role="button"
              tabIndex={0}
              style={{ ["--card-accent" as string]: b.accent }}
            >
              <span className="block-card__icon">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="block-card__title">{b.label}</p>
                <p className="block-card__short">{b.short}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFav(b.kind);
                }}
                className={`block-card__fav ${active ? "block-card__fav--on" : ""}`}
                aria-label="Favorito"
              >
                <Star className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
