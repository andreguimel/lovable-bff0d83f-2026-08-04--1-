import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Contrato de scroll do Dashboard.
 *
 * - `DashboardShell`  → flex-col overflow-hidden, ocupa 100% do <main>.
 * - `DashboardScroll` → único elemento que rola verticalmente.
 * - `WidgetFrame`     → cada widget rola independentemente dentro do próprio card.
 *
 * NUNCA colocar `overflow-y-auto` na página inteira. Isso quebra o padrão
 * SaaS (Linear/Stripe/Attio) onde topbar e sidebar permanecem fixos.
 */

export function DashboardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>{children}</div>
  );
}

export function DashboardScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain",
        "[scrollbar-width:thin] [scrollbar-color:var(--color-muted-foreground)_transparent]",
        className,
      )}
    >
      {children}
    </div>
  );
}
