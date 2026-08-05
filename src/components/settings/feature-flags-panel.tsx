import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Search, Flag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/ui/states/loading-state";
import { ErrorState } from "@/components/ui/states/error-state";
import { PermissionDenied } from "@/components/ui/states/permission-denied";
import { listFeatureFlags, upsertFeatureFlag, deleteFeatureFlag } from "@/lib/feature-flags.functions";
import { usePermission } from "@/hooks/usePermissions";
import { P, MODULE_LABELS } from "@/lib/rbac/registry";

type Flag = {
  id: string; key: string; description?: string; module?: string; environment: string;
  strategy: string; enabled: boolean; rollout_percentage?: number;
  target_roles?: string[]; target_users?: string[]; depends_on?: string[];
  expires_at?: string | null; updated_by?: string | null; updated_at: string;
};

export function FeatureFlagsPanel() {
  const qc = useQueryClient();
  const { allowed } = usePermission(P.SETTINGS.FEATURE_FLAGS);
  const listFn = useServerFn(listFeatureFlags);
  const upsertFn = useServerFn(upsertFeatureFlag);
  const deleteFn = useServerFn(deleteFeatureFlag);

  const q = useQuery({ queryKey: ["feature-flags"], queryFn: () => listFn(), enabled: allowed });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Flag> | null>(null);

  const upsert = useMutation({
    mutationFn: (data: Partial<Flag>) => upsertFn({ data: normalize(data) }),
    onSuccess: () => { toast.success("Flag salva"); setEditing(null); qc.invalidateQueries({ queryKey: ["feature-flags"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Flag removida"); qc.invalidateQueries({ queryKey: ["feature-flags"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const filtered = useMemo(() => {
    const rows = (q.data ?? []) as Flag[];
    if (!search) return rows;
    const t = search.toLowerCase();
    return rows.filter((f) => `${f.key} ${f.description ?? ""} ${f.module ?? ""}`.toLowerCase().includes(t));
  }, [q.data, search]);

  if (!allowed) return <PermissionDenied />;
  if (q.isPending) return <LoadingState rows={6} />;
  if (q.error) return <ErrorState message={String(q.error)} onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar feature flag…" className="pl-9" />
        </div>
        <Button onClick={() => setEditing({ strategy: "boolean", environment: "all", enabled: false, rollout_percentage: 100 })}>
          <Plus className="mr-2 h-4 w-4" /> Nova flag
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Ambiente</TableHead>
              <TableHead>Estratégia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Atualizado</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Nenhuma flag ainda.</TableCell></TableRow>
            )}
            {filtered.map((f) => (
              <TableRow key={f.id} className="cursor-pointer" onClick={() => setEditing(f)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <div className="font-mono text-sm">{f.key}</div>
                      {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{f.module ? MODULE_LABELS[f.module] ?? f.module : "—"}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{f.environment}</Badge></TableCell>
                <TableCell>
                  <Badge variant="outline">{f.strategy}</Badge>
                  {f.strategy === "percentage" && <span className="ml-2 text-xs">{f.rollout_percentage}%</span>}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={f.enabled}
                    onCheckedChange={(v) => upsert.mutate({ ...f, enabled: v })}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(f.updated_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => confirm(`Remover ${f.key}?`) && del.mutate(f.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FlagEditor open={!!editing} value={editing} onClose={() => setEditing(null)} onSave={(v) => upsert.mutate(v)} saving={upsert.isPending} />
    </div>
  );
}

function normalize(data: Partial<Flag>) {
  return {
    key: data.key!,
    description: data.description ?? undefined,
    module: data.module ?? undefined,
    environment: (data.environment as any) ?? "all",
    strategy: (data.strategy as any) ?? "boolean",
    enabled: !!data.enabled,
    rollout_percentage: data.rollout_percentage ?? 100,
    target_roles: data.target_roles ?? undefined,
    target_users: data.target_users ?? undefined,
    depends_on: data.depends_on ?? undefined,
    expires_at: data.expires_at ?? undefined,
  };
}

function FlagEditor({ open, value, onClose, onSave, saving }: {
  open: boolean; value: Partial<Flag> | null; onClose: () => void; onSave: (v: Partial<Flag>) => void; saving: boolean;
}) {
  const [form, setForm] = useState<Partial<Flag>>(value ?? {});
  // Reset on value change
  useMemo(() => { setForm(value ?? {}); }, [value?.id, value?.key]);

  if (!value) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{value.id ? "Editar Flag" : "Nova Feature Flag"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="col-span-2">
            <Label>Chave (key)</Label>
            <Input value={form.key ?? ""} onChange={(e) => setForm({ ...form, key: e.target.value.replace(/\s+/g, "_") })} placeholder="ex: new_inbox_search" disabled={!!value.id} />
          </div>
          <div className="col-span-2">
            <Label>Descrição</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>Módulo</Label>
            <Select value={form.module ?? "none"} onValueChange={(v) => setForm({ ...form, module: v === "none" ? undefined : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {Object.entries(MODULE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ambiente</Label>
            <Select value={form.environment ?? "all"} onValueChange={(v) => setForm({ ...form, environment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="dev">Dev</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="prod">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estratégia</Label>
            <Select value={form.strategy ?? "boolean"} onValueChange={(v) => setForm({ ...form, strategy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="boolean">Boolean (on/off)</SelectItem>
                <SelectItem value="percentage">Rollout percentual</SelectItem>
                <SelectItem value="role">Por cargo</SelectItem>
                <SelectItem value="user">Por usuário</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Habilitada</Label>
            <div className="pt-2"><Switch checked={!!form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /></div>
          </div>
          {form.strategy === "percentage" && (
            <div className="col-span-2">
              <Label>Rollout %</Label>
              <Input type="number" min={0} max={100} value={form.rollout_percentage ?? 100} onChange={(e) => setForm({ ...form, rollout_percentage: Number(e.target.value) })} />
            </div>
          )}
          {form.strategy === "role" && (
            <div className="col-span-2">
              <Label>Cargos alvo (vírgula)</Label>
              <Input value={(form.target_roles ?? []).join(",")} onChange={(e) => setForm({ ...form, target_roles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="admin,agent" />
            </div>
          )}
          <div className="col-span-2">
            <Label>Depende de (chaves de outras flags, vírgula)</Label>
            <Input value={(form.depends_on ?? []).join(",")} onChange={(e) => setForm({ ...form, depends_on: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div className="col-span-2">
            <Label>Expira em</Label>
            <Input type="datetime-local" value={form.expires_at ? form.expires_at.slice(0, 16) : ""} onChange={(e) => setForm({ ...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.key}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
