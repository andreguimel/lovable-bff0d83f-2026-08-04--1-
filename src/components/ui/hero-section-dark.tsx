import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * HeroSectionDark — dark-canvas hero primitive (Zenda Design System V2).
 * Composable shell: glow, grid, and centered content slot.
 */
export interface HeroSectionDarkProps extends React.HTMLAttributes<HTMLElement> {
  /** Enable radial glow overlay. Default true. */
  glow?: boolean;
  /** Enable grid mask overlay. Default true. */
  grid?: boolean;
}

export const HeroSectionDark = React.forwardRef<HTMLElement, HeroSectionDarkProps>(
  ({ className, glow = true, grid = true, children, ...props }, ref) => {
    return (
      <section
        ref={ref}
        className={cn(
          "relative isolate overflow-hidden bg-[oklch(0.145_0.005_285)] text-white",
          className,
        )}
        {...props}
      >
        {glow && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(1200px 600px at 50% -10%, color-mix(in oklab, #6D5EF7 28%, transparent), transparent 60%), radial-gradient(900px 500px at 85% 20%, color-mix(in oklab, #A855F7 18%, transparent), transparent 65%)",
            }}
          />
        )}
        {grid && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 80%)",
            }}
          />
        )}
        <div className="relative">{children}</div>
      </section>
    );
  },
);
HeroSectionDark.displayName = "HeroSectionDark";
