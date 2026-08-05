/**
 * Forward dialog — WhatsApp Web style destination picker.
 *
 * Shows the operator's recent conversations, supports search and
 * multi-select (up to 20 destinations), and triggers `forwardMessages`.
 *
 * Reuses the existing `listConversations` server function so RLS and
 * assignment scope filters apply the same as in the sidebar.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, X, Forward, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listConversations, forwardMessages } from "@/lib/inbox.functions";

const MAX_TARGETS = 20;

export interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Message IDs to forward. */
  sourceMessageIds: string[];
  /** Current conversation id — excluded from the target list. */
  currentConversationId: string;
  /** Called after a successful (or partially successful) forward. */
  onDone?: () => void;
}

type Conv = {
  id: string;
  contact: { id: string; name: string; phone: string | null; avatar_url: string | null } | null;
  channel: { id: string; name: string; phone_number: string | null } | null;
  last_message_preview: string | null;
};

export function ForwardDialog({
  open,
  onOpenChange,
  sourceMessageIds,
  currentConversationId,
  onDone,
}: ForwardDialogProps) {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const forwardFn = useServerFn(forwardMessages);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["inbox", "forward-picker"],
    queryFn: () => listFn({ data: { status: "all" } }),
    enabled: open,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const list = (conversations as Conv[]).filter((c) => c.id !== currentConversationId);
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => {
      const name = c.contact?.name?.toLowerCase() ?? "";
      const phone = c.contact?.phone?.toLowerCase() ?? "";
      const channel = c.channel?.name?.toLowerCase() ?? "";
      return name.includes(s) || phone.includes(s) || channel.includes(s);
    });
  }, [conversations, search, currentConversationId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_TARGETS) {
          toast.info(`Máximo de ${MAX_TARGETS} destinos por encaminhamento.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setSearch("");
  };

  const mut = useMutation({
    mutationFn: () =>
      forwardFn({
        data: {
          sourceMessageIds,
          targetConversationIds: Array.from(selected),
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      for (const t of res.results) {
        qc.invalidateQueries({ queryKey: ["messages", t.targetId] });
      }
      if (res.totalFailed === 0) {
        toast.success(
          res.targetCount === 1
            ? `Encaminhada para 1 conversa`
            : `Encaminhada para ${res.targetCount} conversas`,
        );
      } else if (res.totalForwarded === 0) {
        toast.error(
          `Falha ao encaminhar${res.results[0]?.errors[0] ? `: ${res.results[0].errors[0]}` : ""}`,
        );
      } else {
        toast.warning(
          `${res.totalForwarded} enviadas, ${res.totalFailed} falharam`,
        );
      }
      reset();
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao encaminhar"),
  });

  const handleClose = (v: boolean) => {
    if (!v && mut.isPending) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const count = sourceMessageIds.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="border-b border-border/50 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Forward className="h-4 w-4" />
            Encaminhar {count === 1 ? "mensagem" : `${count} mensagens`}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Selecione até {MAX_TARGETS} conversas de destino.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border/40">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou canal"
              className="pl-8 pr-8 h-9 text-sm"
              autoFocus
            />
            {search && (
              <button
                type="button"
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {selected.size > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {selected.size} de {MAX_TARGETS} selecionadas
            </p>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando conversas…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma conversa encontrada.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {filtered.map((c) => {
                const active = selected.has(c.id);
                const initial = (c.contact?.name ?? "?").charAt(0).toUpperCase();
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors",
                        "hover:bg-accent/60 active:bg-accent",
                        active && "bg-primary/10 hover:bg-primary/15",
                      )}
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[13px] font-semibold text-primary">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-foreground">
                          {c.contact?.name ?? "Sem nome"}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.contact?.phone ?? "sem telefone"}
                          {c.channel?.name ? ` · ${c.channel.name}` : ""}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                        aria-hidden
                      >
                        {active && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="flex-row items-center gap-2 border-t border-border/50 px-5 py-3">
          {selected.size > 0 && (
            <Badge variant="secondary" className="rounded-full">
              {selected.size} {selected.size === 1 ? "destino" : "destinos"}
            </Badge>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleClose(false)}
              disabled={mut.isPending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => mut.mutate()}
              disabled={selected.size === 0 || mut.isPending || sourceMessageIds.length === 0}
              className="gap-1.5"
            >
              {mut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Forward className="h-3.5 w-3.5" />
              )}
              Encaminhar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
