/**
 * FB-05 — Contexto da Node Library.
 *
 * Expõe um único ponto para abrir o Command Palette a partir de qualquer
 * lugar do builder (canvas, atalho global, empty state, botão "+"),
 * carregando um contexto de inserção opcional (source node / edge).
 *
 * O Provider também registra o atalho global (Cmd/Ctrl + K).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import type { InsertContext } from "./insert";

interface OpenOptions {
  /** Contexto de inserção herdado ao selecionar um bloco no palette. */
  insertContext?: InsertContext;
  /** Termo inicial da busca (opcional). */
  initialQuery?: string;
}

interface LibraryContextValue {
  openPalette: (opts?: OpenOptions) => void;
  closePalette: () => void;
}

const LibraryCtx = createContext<LibraryContextValue | null>(null);

export function useLibrary(): LibraryContextValue {
  const v = useContext(LibraryCtx);
  if (!v) throw new Error("useLibrary deve ser usado dentro de <LibraryProvider>");
  return v;
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<OpenOptions>({});

  const openPalette = useCallback((opts: OpenOptions = {}) => {
    setState(opts);
    setOpen(true);
  }, []);
  const closePalette = useCallback(() => setOpen(false), []);

  // Atalho global Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setState({});
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<LibraryContextValue>(
    () => ({ openPalette, closePalette }),
    [openPalette, closePalette],
  );

  return (
    <LibraryCtx.Provider value={value}>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        insertContext={state.insertContext}
        initialQuery={state.initialQuery}
      />
    </LibraryCtx.Provider>
  );
}
