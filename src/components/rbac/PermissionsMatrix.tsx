import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/states/loading-state";
import { ErrorState } from "@/components/ui/states/error-state";
import { PermissionDenied } from "@/components/ui/states/permission-denied";
import { MODULE_LABELS, ACTION_LABELS } from "@/lib/rbac/registry";
import { listPermissions, listRolePermissions, updateRolePermissions } from "@/lib/rbac.functions";
import { usePermission } from "@/hooks/usePermissions";
import { P } from "@/lib/rbac/registry";

type RolePerm = { role: "admin" | "agent"; permission_key: string; granted: boolean };

export function PermissionsMatrixV2() {
  const qc = useQueryClient();
  const { allowed } = usePermission(P.TEAM.MANAGE_ROLES);
  const permsQ = useQuery({ queryKey: ["rbac", "permissions"], queryFn: useServerFn(listPermissions) });
  const grantsQ = useQuery({ queryKey: ["rbac", "role-permissions"], queryFn: useServerFn(listRolePermissions) });
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const saveFn = useServerFn(updateRolePermissions);

  const grantMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const g of (grantsQ.data ?? []) as RolePerm[]) {
      if (g.role === role) m.set(g.permission_key, g.granted);
    }
    for (const [k, v] of pending) m.set(k, v);
    return m;
  }, [grantsQ.data, role, pending]);

  const grouped = useMemo(() => {
    const groups = new Map<string, any[]>();
    const term = q.trim().toLowerCase();
    for (const p of (permsQ.data ?? []) as any[]) {
      if (term && !`${p.key} ${p.label}`.toLowerCase().includes(term)) continue;
      if (!groups.has(p.module)) groups.set(p.module, []);
      groups.get(p.module)!.push(p);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => (MODULE_LABELS[a] ?? a).localeCompare(MODULE_LABELS[b] ?? b));
  }, [permsQ.data, q]);

  const save = useMutation({
    mutationFn: async () => {
      const grants = Array.from(pending, ([permission_key, granted]) => ({ permission_key, granted }));
      return saveFn({ data: { role, grants } });
    },
    onSuccess: () => {
      toast.success("Permissões atualizadas");
      setPending(new Map());
      qc.invalidateQueries({ queryKey: ["rbac"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  if (!allowed) return <PermissionDenied message="Apenas administradores podem editar a matriz de permissões." />;
  if (permsQ.isPending || grantsQ.isPending) return <LoadingState rows={8} label="Carregando matriz…" />;
  if (permsQ.error) return <ErrorState message={String(permsQ.error)} onRetry={() => permsQ.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={role} onValueChange={(v) => setRole(v as any)}>
          <TabsList>
            <TabsTrigger value="admin">Administrador</TabsTrigger>
            <TabsTrigger value="agent">Agente / Operador</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar permissão…" className="pl-9" />
        </div>
        <Button onClick={() => save.mutate()} disabled={pending.size === 0 || save.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? "Salvando…" : `Salvar (${pending.size})`}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {grouped.map(([mod, perms]) => (
          <div key={mod} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">
              {MODULE_LABELS[mod] ?? mod}
            </div>
            <div className="divide-y divide-border">
              {perms.map((p: any) => {
                const on = grantMap.get(p.key) ?? (role === "admin");
                const isDirty = pending.has(p.key);
                return (
                  <label key={p.key} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{p.label ?? p.key}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.key}</span>
                        {p.description && <span> — {p.description}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDirty && <Badge variant="outline" className="text-[10px]">alterado</Badge>}
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) => {
                          const next = new Map(pending);
                          next.set(p.key, !!v);
                          setPending(next);
                        }}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Ações não configuradas herdam o padrão: administradores recebem tudo; agentes recebem apenas o que estiver marcado.
      </div>
      <div aria-hidden className="text-[10px] text-muted-foreground">
        {Object.keys(ACTION_LABELS).length} ações registradas
      </div>
    </div>
  );
}
