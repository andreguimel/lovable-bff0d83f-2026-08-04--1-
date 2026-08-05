import * as React from "react";

export const MOBILE_BREAKPOINT = 768;

function readIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * SSR-safe viewport hook. Returns `true` when the viewport is below the
 * mobile breakpoint (Tailwind `md`). Reads synchronously on mount to avoid
 * a desktop-first flash, and subscribes to changes with matchMedia to avoid
 * resize thrashing.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(readIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile("matches" in e ? e.matches : (e as MediaQueryList).matches);
    };
    // sync once in case width changed between initial render and effect
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
