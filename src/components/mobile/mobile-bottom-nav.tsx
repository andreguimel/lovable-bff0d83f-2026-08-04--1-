import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, MessagesSquare, Users, Workflow, Menu as MenuIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { getUnreadSummary } from "@/lib/analytics.functions";

type NavItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "inbox";
  match: (path: string) => boolean;
  isDrawer?: boolean;
};

const items: NavItem[] = [
  { label: "Início", to: "/", icon: LayoutDashboard, match: (p) => p === "/" },
  { label: "Inbox", to: "/inbox", icon: MessagesSquare, badgeKey: "inbox", match: (p) => p.startsWith("/inbox") },
  { label: "CRM", to: "/crm", icon: Users, match: (p) => p.startsWith("/crm") },
  { label: "Fluxos", to: "/flows", icon: Workflow, match: (p) => p.startsWith("/flows") },
  { label: "Menu", to: "#menu", icon: MenuIcon, match: () => false, isDrawer: true },
];

export function MobileBottomNav({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: notif } = useQuery({
    queryKey: ["unread-summary"],
    queryFn: () => getUnreadSummary(),
    refetchInterval: 30_000,
  });
  const inboxBadge = notif?.unreadCount ?? 0;

  return (
    <nav
      aria-label="Navegação principal"
      className="sticky bottom-0 z-40 border-t border-border/60 glass"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {items.map((item) => {
          const active = item.match(pathname);
          const badge = item.badgeKey === "inbox" ? inboxBadge : 0;
          const content = (
            <span className="relative flex flex-col items-center justify-center gap-0.5">
              <span
                className={`grid h-8 w-14 place-items-center rounded-full transition-all duration-200 ${
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground group-active:bg-accent/60"
                }`}
              >
                <item.icon className={`h-[22px] w-[22px] ${active ? "" : "opacity-90"}`} />
                {badge > 0 ? (
                  <span className="absolute right-2 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span
                className={`text-[10.5px] font-medium leading-none tracking-tight ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </span>
          );
          return (
            <li key={item.label} className="flex">
              {item.isDrawer ? (
                <button
                  type="button"
                  onClick={onOpenDrawer}
                  aria-label={item.label}
                  className="group flex h-16 min-h-11 w-full items-center justify-center pt-1.5"
                >
                  {content}
                </button>
              ) : (
                <Link
                  to={item.to}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className="group flex h-16 min-h-11 w-full items-center justify-center pt-1.5"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
