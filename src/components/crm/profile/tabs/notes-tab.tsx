import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pin, PinOff, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClientTime } from "@/components/client-time";
import {
  listContactNotes,
  createContactNote,
  updateContactNote,
  deleteContactNote,
} from "@/lib/crm-hub.functions";
import { cn } from "@/lib/utils";

export function NotesTab({ contactId }: { contactId: string }) {
  const listFn = useServerFn(listContactNotes);
  const createFn = useServerFn(createContactNote);
  const updateFn = useServerFn(updateContactNote);
  const delFn = useServerFn(deleteContactNote);
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const q = useQuery({
    queryKey: ["contact-notes", contactId],
    queryFn: () => listFn({ data: { contactId } }),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { contactId, body } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["contact-notes", contactId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pin = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) =>
      updateFn({ data: { id: v.id, pinned: v.pinned } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-notes", contactId] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-notes", contactId] }),
  });

  const notes = q.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escreva uma nota interna…"
          rows={3}
          className="resize-none border-0 p-0 shadow-none focus-visible:ring-0"
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={!body.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            Adicionar nota
          </Button>
        </div>
      </div>

      {notes.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
          Sem notas ainda.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {notes.map((n) => (
          <div
            key={n.id}
            className={cn(
              "group rounded-xl border border-border/40 bg-card p-3",
              n.pinned && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>
              <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => pin.mutate({ id: n.id, pinned: !n.pinned })}
                >
                  {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => remove.mutate(n.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <ClientTime iso={n.updated_at} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
