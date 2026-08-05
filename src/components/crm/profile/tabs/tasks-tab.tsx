import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Plus, Trash2, CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ClientTime } from "@/components/client-time";
import {
  listContactTasks,
  createContactTask,
  updateContactTask,
  deleteContactTask,
} from "@/lib/crm-hub.functions";
import { cn } from "@/lib/utils";

export function TasksTab({ contactId }: { contactId: string }) {
  const listFn = useServerFn(listContactTasks);
  const createFn = useServerFn(createContactTask);
  const updateFn = useServerFn(updateContactTask);
  const delFn = useServerFn(deleteContactTask);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");

  const q = useQuery({
    queryKey: ["contact-tasks", contactId],
    queryFn: () => listFn({ data: { contactId } }),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { contactId, title } }),
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (t: { id: string; done: boolean }) =>
      updateFn({ data: { id: t.id, status: t.done ? "done" : "open" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] }),
  });

  const tasks = q.data ?? [];
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          create.mutate();
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova tarefa… (ex.: Follow-up amanhã 10h)"
          className="h-10"
        />
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </form>

      <div className="flex flex-col gap-1.5">
        {open.length === 0 && done.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
            Nenhuma tarefa ainda. Adicione a primeira acima.
          </p>
        )}
        {open.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onToggle={(done) => toggle.mutate({ id: t.id, done })}
            onDelete={() => remove.mutate(t.id)}
          />
        ))}
        {done.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold uppercase text-muted-foreground">Concluídas</p>
            {done.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={(done) => toggle.mutate({ id: t.id, done })}
                onDelete={() => remove.mutate(t.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: { id: string; title: string; status: string; priority: string; due_at: string | null };
  onToggle: (done: boolean) => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border/40 bg-card px-3 py-2.5 transition-colors hover:border-border/70",
        done && "opacity-60",
      )}
    >
      <Checkbox checked={done} onCheckedChange={(v) => onToggle(!!v)} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", done && "line-through")}>{task.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {task.priority !== "medium" && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] capitalize">
              {task.priority}
            </Badge>
          )}
          {task.due_at && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              <ClientTime iso={task.due_at} />
            </span>
          )}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 opacity-0 group-hover:opacity-100"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}
