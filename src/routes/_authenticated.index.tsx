import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { DashboardShell, DashboardScroll } from "@/components/dashboard/shell/dashboard-shell";
import { DashboardHeader, greetingByHour, DashboardRangeProvider } from "@/components/dashboard/shell/dashboard-header";
import { WidgetFrame } from "@/components/dashboard/shell/widget-frame";
import { CommandPalette } from "@/components/dashboard/commands/command-palette";
import { bootstrapWidgets } from "@/components/dashboard/widgets";
import { listWidgets, type WidgetDefinition } from "@/lib/dashboard/widget-registry";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileDashboard } from "@/components/dashboard/mobile/mobile-dashboard";

bootstrapWidgets();

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Comando de operação" },
      {
        name: "description",
        content:
          "Cockpit em tempo real da sua operação: conversas, fluxos, agentes IA, campanhas, cascatas e saúde do sistema.",
      },
    ],
  }),
  component: DashboardRoute,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro ao carregar dashboard: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

function DashboardRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileDashboard /> : <Dashboard />;
}
// Execute esta instrucao no projeto: resolva a questão de conexão em canais

function buildGridClasses(w: WidgetDefinition): string {
  const cols = w.size.w;
  if (cols >= 12) return "col-span-1 md:col-span-2 xl:col-span-4";
  if (cols >= 8) return "col-span-1 md:col-span-2 xl:col-span-3";
  if (cols >= 6) return "col-span-1 md:col-span-2 xl:col-span-2";
  return "col-span-1 md:col-span-1 xl:col-span-1";
}

// Alturas fixas por widget para preservar o scroll interno (nunca depender do conteúdo).
function heightClass(w: WidgetDefinition): string {
  const h = w.size.h;
  if (h >= 6) return "min-h-[360px] xl:min-h-[420px]";
  if (h >= 5) return "min-h-[320px]";
  if (h >= 4) return "min-h-[260px]";
  return "min-h-[200px]";
}

function Dashboard() {
  const [displayName, setDisplayName] = useState<string>("");
  const widgets = useMemo(() => listWidgets().filter((w) => !w.hidden), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const name =
        (data.user?.user_metadata?.full_name as string | undefined) ??
        data.user?.email?.split("@")[0] ??
        "";
      if (alive && name) setDisplayName(name);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const greeting = `${greetingByHour()}${displayName ? `, ${displayName}` : ""} 👋`;

  return (
    <DashboardRangeProvider>
      <DashboardShell>
        <DashboardHeader greeting={greeting} />
        <DashboardScroll>
          <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-4 p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-4">
            {widgets.map((w) => {
              const WidgetBody = w.component;
              return (
                <div key={w.id} className={`${buildGridClasses(w)} ${heightClass(w)} flex`}>
                  <WidgetFrame widget={w} className="w-full">
                    <WidgetBody />
                  </WidgetFrame>
                </div>
              );
            })}
          </div>
        </DashboardScroll>
        <CommandPalette />
      </DashboardShell>
    </DashboardRangeProvider>
  );
}
