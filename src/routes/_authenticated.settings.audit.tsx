import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { GuardianPanel } from "@/components/settings/guardian-panel";
import { MobileGuardianHome } from "@/components/guardian/mobile/mobile-guardian-home";
import { useIsMobile } from "@/hooks/use-mobile";

const auditSearchSchema = z.object({ incident: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/settings/audit")({
  validateSearch: (search: Record<string, unknown>) => auditSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Guardião — Zenda" },
      {
        name: "description",
        content:
          "Agente que audita o sistema, corrige dados/config em tempo real e sugere patches de código.",
      },
    ],
  }),
  component: AuditPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

function AuditPage() {
  const { incident } = Route.useSearch();
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileGuardianHome initialIncidentId={incident} />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Guardião do sistema</h1>
        <p className="text-sm text-muted-foreground">
          Um agente sênior com contexto de todo o Zenda. Pergunte, diagnostique e execute
          reparos operacionais direto daqui.
        </p>
      </div>
      <GuardianPanel initialIncidentId={incident} />
    </div>
  );
}

