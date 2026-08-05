import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Copy, GripVertical, Users2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import {
  listQueues,
  createQueue,
  updateQueue,
  archiveQueue,
  deleteQueue,
  duplicateQueue,
  reorderQueues,
} from "@/lib/team-studio.functions";

type Queue = {
  id: string; name: string; color: string | null; description: string | null; tags: string[] | null;
  priority: number; capacity: number; max_concurrent: number; strategy: string;
  archived_at: string | null;
};

const STRATEGY_LABEL: Record<string, string> = {
  round_robin: "Round Robin",
  least_busy: "Menos ocupado",
  random: "Aleatório",
  priority: "Por prioridade",
  manual: "Manual",
};

export function QueuesPanel() {
  const qc = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Queue | null>(null);
  const [creating, setCreating] = useState(false);

  const listFn = useServerFn(listQueues);
  const { data, isPending } = useQuery({
    queryKey: ["queues", includeArchived],
    queryFn: () => listFn({ data: { includeArchived } }),
  });
  const queues: Queue[] = data?.queues ?? [];
  const memberships: Array<{ queue_id: string; user_id: string }> = data?.memberships ?? [];
  const countByQueue = new Map<string, number>();
  memberships.forEach((m) => countByQueue.set(m.queue_id, (countByQueue.get(m.queue_id) ?? 0) + 1));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["queues"] });
    qc.invalidateQueries({ queryKey: ["team-overview"] });
  };

  const archiveFn = useServerFn(archiveQueue);
  const archiveM = useMutation({
    mutationFn: (v: { id: string; archive: boolean }) => archiveFn({ data: v }),
    onSuccess: (_d, v) => { toast.success(v.archive ? "Fila arquivada" : "Fila reativada"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delFn = useServerFn(deleteQueue);
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Fila excluída"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const dupFn = useServerFn(duplicateQueue);
  const dupM = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => { toast.success("Fila duplicada"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const reorderFn = useServerFn(reorderQueues);
  const reorderM = useMutation({
    mutationFn: (orderedIds: string[]) => reorderFn({ data: { orderedIds } }),
    onSuccess: () => { toast.success("Prioridade atualizada"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  function move(id: string, dir: -1 | 1) {
    const ids = queues.map((q) => q.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderM.mutate(ids);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Filas de atendimento</h3>
          <Badge variant="outline" className="text-[10px]">{queues.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setIncludeArchived(!includeArchived)}>
            {includeArchived ? "Ocultar arquivadas" : "Mostrar arquivadas"}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" /> Nova</Button>
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : queues.length === 0 ? (
        <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-xl">
          Nenhuma fila. Clique em "Nova" para criar.
        </div>
      ) : (
        <div className="space-y-2">
          {queues.map((q, idx) => (
            <div key={q.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3 bg-card">
              <div className="flex flex-col">
                <button className="hover:text-primary disabled:opacity-30" disabled={idx === 0} onClick={() => move(q.id, -1)} title="Subir">▲</button>
                <button className="hover:text-primary disabled:opacity-30" disabled={idx === queues.length - 1} onClick={() => move(q.id, 1)} title="Descer">▼</button>
              </div>
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: q.color ?? "#22C55E" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {q.name}
                  {q.archived_at && <Badge variant="outline" className="text-[10px]">arquivada</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Prioridade {q.priority} · {STRATEGY_LABEL[q.strategy] ?? q.strategy} · cap {q.capacity} · simult. {q.max_concurrent}
                </div>
              </div>
              <Badge variant="secondary" className="gap-1"><Users2 className="h-3 w-3" />{countByQueue.get(q.id) ?? 0}</Badge>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(q)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => dupM.mutate(q.id)} title="Duplicar"><Copy className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => archiveM.mutate({ id: q.id, archive: !q.archived_at })} title={q.archived_at ? "Reativar" : "Arquivar"}>
                  {q.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir fila?</AlertDialogTitle>
                      <AlertDialogDescription>Todos os membros da fila serão desvinculados. Prefira arquivar quando puder.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => delM.mutate(q.id)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <QueueSheet
        open={creating || !!editing}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}
        queue={editing}
        onSaved={invalidate}
      />
    </div>
  );
}

function QueueSheet({ open, onOpenChange, queue, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; queue: Queue | null; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#22C55E");
  const [description, setDescription] = useState("");
  const [strategy, setStrategy] = useState("round_robin");
  const [priority, setPriority] = useState(5);
  const [capacity, setCapacity] = useState(10);
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [tagsInput, setTagsInput] = useState("");

  useSyncOpen(open, () => {
    setName(queue?.name ?? "");
    setColor(queue?.color ?? "#22C55E");
    setDescription(queue?.description ?? "");
    setStrategy(queue?.strategy ?? "round_robin");
    setPriority(queue?.priority ?? 5);
    setCapacity(queue?.capacity ?? 10);
    setMaxConcurrent(queue?.max_concurrent ?? 3);
    setTagsInput((queue?.tags ?? []).join(", "));
  });

  const createFn = useServerFn(createQueue);
  const updateFn = useServerFn(updateQueue);
  const save = useMutation({
    mutationFn: async () => {
      const tags = tagsInput.split(",").map((s) => s.trim()).filter(Boolean);
      const body = { name, color, description, strategy: strategy as any, priority, capacity, max_concurrent: maxConcurrent, tags };
      if (queue) return updateFn({ data: { id: queue.id, ...body } });
      return createFn({ data: body });
    },
    onSuccess: () => { toast.success(queue ? "Fila atualizada" : "Fila criada"); onSaved(); onOpenChange(false); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader><SheetTitle>{queue ? "Editar fila" : "Nova fila"}</SheetTitle></SheetHeader>
        <div className="flex-1 overflow-auto space-y-3 pt-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 rounded-md border" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estratégia</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round_robin">Round Robin</SelectItem>
                  <SelectItem value="least_busy">Menos ocupado</SelectItem>
                  <SelectItem value="random">Aleatório</SelectItem>
                  <SelectItem value="priority">Por prioridade</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Input type="number" min={1} max={10} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Capacidade</Label>
              <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Simultâneos</Label>
              <Input type="number" min={1} max={50} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tags (vírgula)</Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="prioridade, vip" />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function useSyncOpen(open: boolean, cb: () => void) {
  const [prev, setPrev] = useState(open);
  if (open !== prev) { setPrev(open); if (open) cb(); }
}
