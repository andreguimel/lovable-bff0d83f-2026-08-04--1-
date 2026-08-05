import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export type FabAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
};

type Ctx = {
  action: FabAction | null;
  setAction: (a: FabAction | null) => void;
};

const FabContext = createContext<Ctx | null>(null);

export function MobileFabProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<FabAction | null>(null);
  const value = useMemo(() => ({ action, setAction }), [action]);
  return <FabContext.Provider value={value}>{children}</FabContext.Provider>;
}

/**
 * Register a contextual Floating Action Button for the current route.
 * The FAB is rendered by <MobileFabSlot/> inside the mobile shell.
 * Only one FAB is active at any time — the last registered wins.
 *
 * NOTE: this is intentionally a plain setter. Modules integrate their own
 * useEffect + cleanup during Mobile-2..7.
 */
// Fallback no-op context used when a component that calls useMobileFab is
// mounted outside a MobileFabProvider (e.g. desktop shells that share code
// with mobile routes). Prevents desktop pages from crashing with
// "useMobileFab must be used inside MobileFabProvider".
const NOOP_FAB_CTX: Ctx = { action: null, setAction: () => {} };

export function useMobileFab() {
  const ctx = useContext(FabContext);
  return ctx ?? NOOP_FAB_CTX;
}

export function MobileFabSlot() {
  const ctx = useContext(FabContext);
  if (!ctx || !ctx.action) return null;
  const { label, icon: Icon, onClick } = ctx.action;
  return (
    <div
      className="pointer-events-none absolute bottom-20 right-4 z-30"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
    >
      <Button
        aria-label={label}
        onClick={onClick}
        className="pointer-events-auto h-14 w-14 rounded-full bg-gradient-primary p-0 shadow-[0_10px_32px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:opacity-95 active:scale-95"
      >
        <Icon className="h-6 w-6" />
      </Button>
    </div>
  );
}
