import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StickyNote, Trash2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  listConversationNotes,
  createConversationNote,
  deleteConversationNote,
} from "@/lib/inbox.functions";
import { subscribeRealtime } from "@/lib/realtime/registry";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  currentUserId: string | null;
}

const MAX_LEN = 4000;

export function InternalNotesSheet({ open, onOpenChange, conversationId, currentUserId }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversationNotes);
  const createFn = useServerFn(createConversationNote);
  const deleteFn = useServerFn(deleteConversationNote);

  const [draft, setDraft] = useState("");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["conversation-notes", conversationId],
    queryFn: () => listFn({ data: { conversationId } }),
    enabled: open,
  });

  // Realtime — nova nota criada em outra aba/usuário aparece sem reload.
  useEffect(() => {
    if (!open) return;
    const unsub = subscribeRealtime(`notes:${conversationId}`, {
      table: "conversation_notes",
      filter: `conversation_id=eq.${conversationId}`,
      onEvent: () => qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] }),
    });
    return () => unsub();
  }, [open, conversationId, qc]);

  const createMut = useMutation({
    mutationFn: (body: string) => createFn({ data: { conversationId, body } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    if (body.length > MAX_LEN) {
      toast.error(`Máx ${MAX_LEN} caracteres`);
      return;
    }
    createMut.mutate(body);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] p-0 flex flex-col">
        <SheetHeader className="border-b border-border/60 px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <StickyNote className="h-4 w-4 text-amber-500" />
            Notas internas
          </SheetTitle>
          <SheetDescription className="text-[11px] flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Visível apenas para a equipe. NUNCA enviada ao cliente.
          </SheetDescription>
        </SheetHeader>

        {/* Composer */}
        <div className="border-b border-border/40 px-4 py-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escreva uma nota interna…"
            className="min-h-[80px] resize-none bg-amber-50/40 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-900/40 focus-visible:ring-amber-500/40"
            maxLength={MAX_LEN}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {draft.length}/{MAX_LEN} · ⌘/Ctrl + Enter
            </span>
            <Button
              size="sm"
              onClick={submit}
              disabled={createMut.isPending || draft.trim().length === 0}
            >
              {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar nota"}
            </Button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {isLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Carregando…</p>
          ) : notes.length === 0 ? (
            <div className="py-10 text-center">
              <StickyNote className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-xs text-muted-foreground">Sem notas ainda.</p>
            </div>
          ) : (
            notes.map((n) => {
              const isMine = n.author_id === currentUserId;
              const authorName = n.author?.full_name ?? "Membro";
              return (
                <div
                  key={n.id}
                  className="rounded-md border border-amber-200/50 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/10 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-foreground/90 truncate">
                        {authorName}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    {isMine && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMut.mutate(n.id)}
                        disabled={deleteMut.isPending}
                        aria-label="Excluir nota"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] text-foreground/95">{n.body}</p>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
