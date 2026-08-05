import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getRolePermissions } from "@/lib/team-studio.functions";
import { PermissionMatrix } from "@/components/team/permission-matrix";

export const Route = createFileRoute("/_authenticated/team/roles")({
  head: () => ({ meta: [{ title: "Cargos & Permissões — Equipe" }] }),
  component: RolesPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Não encontrado.</div>,
});

function RolesPage() {
  const { data, isPending } = useQuery({
    queryKey: ["role-permissions"],
    queryFn: () => getRolePermissions(),
  });

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Link to="/team" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-3 w-3" /> Voltar para Equipe
      </Link>

      <div className="studio-header">
        <div className="studio-avatar"><Shield className="h-7 w-7" /></div>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Cargos & Permissões</h1>
          <p className="text-sm text-muted-foreground">Configure o que cada cargo pode fazer em cada módulo da plataforma.</p>
        </div>
      </div>

      {isPending ? (
        <div className="h-64 rounded-2xl bg-muted/40 animate-pulse" />
      ) : (
        <PermissionMatrix initial={data ?? []} />
      )}
    </div>
  );
}
