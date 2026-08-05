import { createFileRoute } from "@tanstack/react-router";
import { FeatureFlagsPanel } from "@/components/settings/feature-flags-panel";

export const Route = createFileRoute("/_authenticated/settings/feature-flags")({
  head: () => ({
    meta: [
      { title: "Feature Flags — Configurações" },
      { name: "description", content: "Gerencie feature flags com rollout, ambientes e dependências." },
    ],
  }),
  component: FeatureFlagsPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

function FeatureFlagsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Feature Flags</h1>
        <p className="text-sm text-muted-foreground">
          Controle funcionalidades por empresa, ambiente, cargo ou percentual de rollout.
        </p>
      </header>
      <FeatureFlagsPanel />
    </div>
  );
}
