import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  listDepartments,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  deleteDepartment,
  listEntityHistory,
} from "@/lib/team-studio.functions";

type Dept = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  tags: string[] | null;
  archived_at: string | null;
};

export function DepartmentsPanel() {
  const qc = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [creating, setCreating] = useState(false);

  const listFn = useServerFn(listDepartments);
  const { data: depts = [], isPending } = useQuery({
    queryKey: ["departments", includeArchived],
    queryFn: () => listFn({ data: { includeArchived } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["departments"] });
    qc.invalidateQueries({ queryKey: ["team-overview"] });
  };

  const archiveFn = useServerFn(archiveDepartment);
  const archiveM = useMutation({
    mutationFn: (v: { id: string; archive: boolean }) => archiveFn({ data: v }),
    onSuccess: (_d, v) => { toast.success(v.archive ? "Departamento arquivado" : "Departamento reativado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const delFn = useServerFn(deleteDepartment);
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Departamento excluído"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Departamentos</h3>
          <Badge variant="outline" className="text-[10px]">{depts.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setIncludeArchived(!includeArchived)}>
            {includeArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
        </div>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : depts.length === 0 ? (
        <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-xl">
          Nenhum departamento. Clique em "Novo" para criar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {depts.map((d: Dept) => (
            <div key={d.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3 bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: d.color ?? "#3B82F6" }} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {d.name}
                    {d.archived_at && <Badge variant="outline" className="text-[10px]">arquivado</Badge>}
                  </div>
                  {d.description && <div className="text-[11px] text-muted-foreground truncate">{d.description}</div>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(d)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => archiveM.mutate({ id: d.id, archive: !d.archived_at })} title={d.archived_at ? "Reativar" : "Arquivar"}>
                  {d.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir departamento?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação é permanente. Se houver colaboradores vinculados, a exclusão será bloqueada. Considere arquivar em vez de excluir.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => delM.mutate(d.id)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <DepartmentSheet
        open={creating || !!editing}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}
        dept={editing}
        onSaved={invalidate}
      />
    </div>
  );
}

function DepartmentSheet({ open, onOpenChange, dept, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; dept: Dept | null; onSaved: () => void;
}) {
  const [name, setName] = useState(dept?.name ?? "");
  const [color, setColor] = useState(dept?.color ?? "#3B82F6");
  const [description, setDescription] = useState(dept?.description ?? "");
  const [tagsInput, setTagsInput] = useState((dept?.tags ?? []).join(", "));

  // sync when opening
  useSyncOpen(open, () => {
    setName(dept?.name ?? "");
    setColor(dept?.color ?? "#3B82F6");
    setDescription(dept?.description ?? "");
    setTagsInput((dept?.tags ?? []).join(", "));
  });

  const createFn = useServerFn(createDepartment);
  const updateFn = useServerFn(updateDepartment);
  const historyFn = useServerFn(listEntityHistory);

  const { data: history = [] } = useQuery({
    queryKey: ["dept-history", dept?.id],
    queryFn: () => historyFn({ data: { entity: "department", entityId: dept!.id } }),
    enabled: !!dept?.id && open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const tags = tagsInput.split(",").map((s) => s.trim()).filter(Boolean);
      if (dept) return updateFn({ data: { id: dept.id, name, color, description: description || null, tags } });
      return createFn({ data: { name, color, description, tags } });
    },
    onSuccess: () => { toast.success(dept ? "Departamento atualizado" : "Departamento criado"); onSaved(); onOpenChange(false); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{dept ? "Editar departamento" : "Novo departamento"}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="edit" className="flex-1 flex flex-col mt-3">
          <TabsList>
            <TabsTrigger value="edit">Editar</TabsTrigger>
            {dept && <TabsTrigger value="history"><History className="h-3.5 w-3.5 mr-1" />Histórico</TabsTrigger>}
          </TabsList>
          <TabsContent value="edit" className="space-y-3 flex-1 overflow-auto pt-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Comercial, Suporte…" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 rounded-md border" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="max-w-32" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="vip, interno" />
            </div>
          </TabsContent>
          {dept && (
            <TabsContent value="history" className="flex-1 overflow-auto pt-3 space-y-2">
              {history.length === 0 ? (
                <div className="text-xs text-muted-foreground">Sem alterações registradas.</div>
              ) : (
                history.map((h: any) => (
                  <div key={h.id} className="text-xs rounded-lg border p-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{h.action}</span>
                      <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          )}
        </Tabs>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function useSyncOpen(open: boolean, cb: () => void) {
  const [prev, setPrev] = useState(open);
  if (open !== prev) { setPrev(open); if (open) cb(); }
}
