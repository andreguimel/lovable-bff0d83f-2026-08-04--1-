import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Loader2, Pencil, Plus, Search, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listQuickReplies,
  upsertQuickReply,
  deleteQuickReply,
  createFolder,
  deleteFolder,
} from "@/lib/quick-replies.functions";

export const Route = createFileRoute("/_authenticated/quick-replies")({
  head: () => ({
    meta: [
      { title: "Mensagens rápidas — Zenda" },
      { name: "description", content: "Crie atalhos /comando para respostas frequentes no atendimento." },
    ],
  }),
  component: QuickRepliesPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Erro: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

type Reply = {
  id: string;
  folder_id: string | null;
  shortcut: string;
  title: string;
  body: string;
  attachments: unknown;
};

function QuickRepliesPage() {
  const [q, setQ] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const { data, isPending } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => listQuickReplies(),
  });

  const filtered = useMemo(() => {
    const replies = (data?.replies ?? []) as Reply[];
    return replies.filter((r) => {
      if (folderFilter !== "all" && (r.folder_id ?? "none") !== folderFilter) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return r.shortcut.toLowerCase().includes(s) || r.title.toLowerCase().includes(s);
    });
  }, [data, q, folderFilter]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Mensagens rápidas</h1>
          <p className="text-sm text-muted-foreground">
            Digite <code className="rounded bg-muted px-1">/</code> no chat para acessar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FolderDialog />
          <ReplySheet folders={data?.folders ?? []} />
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-9 pl-9" />
        </div>
        <Select value={folderFilter} onValueChange={setFolderFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as pastas</SelectItem>
            <SelectItem value="none">Sem pasta</SelectItem>
            {(data?.folders ?? []).map((f) => (
              <SelectItem key={f.id as string} value={f.id as string}>
                {f.name as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(data?.folders ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(data?.folders ?? []).map((f) => (
            <FolderChip key={f.id as string} id={f.id as string} name={f.name as string} />
          ))}
        </div>
      )}

      {isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-16 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma mensagem rápida encontrada.</p>
            <p className="text-xs text-muted-foreground">
              Crie sua primeira com o botão "Nova mensagem" acima.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((r) => (
            <ReplyCard key={r.id} r={r} folders={data?.folders ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderChip({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => deleteFolder({ data: { id } }),
    onSuccess: () => {
      toast.success("Pasta removida");
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Badge variant="outline" className="cursor-pointer gap-1">
          {name}
          <Trash2 className="h-3 w-3 opacity-60" />
        </Badge>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir pasta "{name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            As mensagens dentro dela ficarão sem pasta, mas não serão apagadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FolderDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: () => createFolder({ data: { name } }),
    onSuccess: () => {
      toast.success("Pasta criada");
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
      setOpen(false);
      setName("");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><FolderPlus className="mr-1 h-4 w-4" /> Nova pasta</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova pasta</DialogTitle></DialogHeader>
        <div className="grid gap-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Vendas" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!name || m.isPending}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplySheet({
  folders,
  initial,
  trigger,
}: {
  folders: Array<{ id: unknown; name: unknown }>;
  initial?: Reply;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [shortcut, setShortcut] = useState(initial?.shortcut ?? "/");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [folderId, setFolderId] = useState<string>(initial?.folder_id ?? "none");

  const m = useMutation({
    mutationFn: () =>
      upsertQuickReply({
        data: {
          id: initial?.id,
          shortcut,
          title,
          body,
          folder_id: folderId === "none" ? null : folderId,
        },
      }),
    onSuccess: () => {
      toast.success(initial ? "Mensagem atualizada" : "Mensagem criada");
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Nova mensagem</Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>{initial ? "Editar mensagem" : "Nova mensagem rápida"}</SheetTitle></SheetHeader>
        <div className="grid gap-3 px-4 py-2">
          <div className="grid gap-1.5">
            <Label>Atalho</Label>
            <Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="/preco" />
            <p className="text-xs text-muted-foreground">Deve começar com "/".</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enviar preço" />
          </div>
          <div className="grid gap-1.5">
            <Label>Mensagem</Label>
            <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Olá {{nome}}!" />
          </div>
          <div className="grid gap-1.5">
            <Label>Pasta</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem pasta</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id as string} value={f.id as string}>
                    {f.name as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !shortcut || !title || !body}>
            {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ReplyCard({ r, folders }: { r: Reply; folders: Array<{ id: unknown; name: unknown }> }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => deleteQuickReply({ data: { id: r.id } }),
    onSuccess: () => {
      toast.success("Mensagem excluída");
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </span>
            <div>
              <p className="font-mono text-xs text-primary">{r.shortcut}</p>
              <p className="text-sm font-semibold">{r.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ReplySheet
              folders={folders}
              initial={r}
              trigger={
                <Button size="icon" variant="ghost" aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
              }
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Excluir">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir "{r.title}"?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => m.mutate()}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{r.body}</p>
      </CardContent>
    </Card>
  );
}
