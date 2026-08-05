/**
 * FB-05 — Preferências da Node Library (localStorage + hooks).
 *
 * Persiste favoritos, recentes e contagem de uso. Escopo por browser
 * do usuário (Lovable já é single-user por sessão de navegador).
 *
 * Não conhece Registry — trabalha só com `kind: string`.
 */
import { useCallback, useEffect, useState } from "react";

const NS = "flow-builder.v2";
const K_FAV = `${NS}.favorites`;
const K_RECENT = `${NS}.recent`;
const K_USAGE = `${NS}.usage`;

const MAX_RECENT = 8;

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — silencioso */
  }
}

/** Snapshot puro — usado em busca e testes. */
export interface PrefsSnapshot {
  favorites: Set<string>;
  recents: string[];
  usage: Record<string, number>;
}

export function readPrefs(): PrefsSnapshot {
  return {
    favorites: new Set(safeRead<string[]>(K_FAV, [])),
    recents: safeRead<string[]>(K_RECENT, []),
    usage: safeRead<Record<string, number>>(K_USAGE, {}),
  };
}

export function toggleFavorite(kind: string): Set<string> {
  const list = safeRead<string[]>(K_FAV, []);
  const set = new Set(list);
  if (set.has(kind)) set.delete(kind);
  else set.add(kind);
  safeWrite(K_FAV, [...set]);
  window.dispatchEvent(new CustomEvent(`${NS}:prefs`));
  return set;
}

export function pushRecent(kind: string): string[] {
  const cur = safeRead<string[]>(K_RECENT, []);
  const next = [kind, ...cur.filter((x) => x !== kind)].slice(0, MAX_RECENT);
  safeWrite(K_RECENT, next);
  window.dispatchEvent(new CustomEvent(`${NS}:prefs`));
  return next;
}

export function bumpUsage(kind: string): Record<string, number> {
  const cur = safeRead<Record<string, number>>(K_USAGE, {});
  cur[kind] = (cur[kind] ?? 0) + 1;
  safeWrite(K_USAGE, cur);
  window.dispatchEvent(new CustomEvent(`${NS}:prefs`));
  return cur;
}

/** Registra escolha (recent + usage) de uma só vez. */
export function markUsed(kind: string): void {
  pushRecent(kind);
  bumpUsage(kind);
}

export function topUsed(usage: Record<string, number>, n = 5): string[] {
  return Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** Hook reativo — reage a `storage` (outras abas) e a evento local. */
export function usePrefs(): PrefsSnapshot {
  const [snap, setSnap] = useState<PrefsSnapshot>(() => readPrefs());
  useEffect(() => {
    const refresh = () => setSnap(readPrefs());
    window.addEventListener("storage", refresh);
    window.addEventListener(`${NS}:prefs`, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(`${NS}:prefs`, refresh);
    };
  }, []);
  return snap;
}

export function useTogglesFavorite() {
  return useCallback((kind: string) => toggleFavorite(kind), []);
}

/** Reset — usado em testes. */
export function _resetPrefs(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(K_FAV);
  window.localStorage.removeItem(K_RECENT);
  window.localStorage.removeItem(K_USAGE);
}
