/**
 * FB-13.3 · ShortcutsOverlay
 *
 * Painel discreto de atalhos do canvas. Aparece quando `open` é true.
 * Estética Cyber-Industrial: fundo blur, borda LED, tipografia mono.
 */
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "K"], label: "Abrir paleta de comandos" },
  { keys: ["?"], label: "Mostrar/ocultar atalhos" },
  { keys: ["⌘", "D"], label: "Duplicar bloco selecionado" },
  { keys: ["⌫"], label: "Excluir seleção" },
  { keys: ["F"], label: "Enquadrar tudo (fit view)" },
  { keys: ["O"], label: "Organizar fluxo (auto-layout)" },
  { keys: ["Space", "+ arrastar"], label: "Pan do canvas" },
  { keys: ["⌘", "clique"], label: "Seleção múltipla" },
  { keys: ["Esc"], label: "Limpar seleção" },
];

export function ShortcutsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fbv3-shortcuts-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="fbv3-shortcuts"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fbv3-shortcuts__head">
              <span className="fbv3-shortcuts__eyebrow">Atalhos</span>
              <span className="fbv3-shortcuts__title">Comando rápido do canvas</span>
              <button
                type="button"
                className="fbv3-shortcuts__close"
                onClick={onClose}
                aria-label="Fechar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="fbv3-shortcuts__list">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="fbv3-shortcuts__row">
                  <span className="fbv3-shortcuts__label">{s.label}</span>
                  <span className="fbv3-shortcuts__keys">
                    {s.keys.map((k, i) => (
                      <kbd key={i} className="fbv3-kbd">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="fbv3-shortcuts__foot">
              Pressione <kbd className="fbv3-kbd">?</kbd> a qualquer momento
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
