import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Relatórios — Zenda" },
      { name: "description", content: "Relatórios de conversas, cascatas e broadcasts com exportação em CSV." },
    ],
  }),
  component: ReportsLayout,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro ao carregar relatórios: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Relatório não encontrado.</div>,
});

const NAV: Array<{
  id: "conversations" | "broadcasts" | "cascades";
  label: string;
  to: "/reports/conversations" | "/reports/broadcasts" | "/reports/cascades";
}> = [
  { id: "conversations", label: "Conversas", to: "/reports/conversations" },
  { id: "broadcasts", label: "Broadcasts", to: "/reports/broadcasts" },
  { id: "cascades", label: "Cascatas", to: "/reports/cascades" },
];

function ReportsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useIsMobile();
  const current = path.startsWith("/reports/broadcasts")
    ? "broadcasts"
    : path.startsWith("/reports/cascades")
      ? "cascades"
      : "conversations";

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <nav
          role="tablist"
          aria-label="Seções de relatórios"
          className="shrink-0 border-b border-border/50 bg-background/90 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 backdrop-blur"
        >
          <div className="-mx-4 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-1.5">
              {NAV.map((n) => {
                const active = current === n.id;
                return (
                  <Link
                    key={n.id}
                    to={n.to}
                    role="tab"
                    aria-selected={active}
                    className={`h-10 shrink-0 rounded-full px-4 text-xs font-semibold tracking-wide transition ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Analise conversas, broadcasts e cascatas. Exporte em CSV.</p>
      </div>
      <Tabs value={current}>
        <TabsList>
          <TabsTrigger value="conversations" asChild>
            <Link to="/reports/conversations">Conversas</Link>
          </TabsTrigger>
          <TabsTrigger value="broadcasts" asChild>
            <Link to="/reports/broadcasts">Broadcasts</Link>
          </TabsTrigger>
          <TabsTrigger value="cascades" asChild>
            <Link to="/reports/cascades">Cascatas</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
