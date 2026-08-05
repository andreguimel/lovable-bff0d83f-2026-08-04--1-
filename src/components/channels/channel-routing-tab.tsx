import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Plus, Search, Users, Loader2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@tanstack/react-router";

import {
  getChannelRouting,
  createDepartmentInline,
  saveChannelRouting,
} from "@/lib/channels.functions";

interface Props {
  channelId: string;
}

export function ChannelRoutingTab({ channelId }: Props) {
  const qc = useQueryClient();
  const getRouting = useServerFn(getChannelRouting);
  const createDept = useServerFn(createDepartmentInline);
  const saveRouting = useServerFn(saveChannelRouting);

  const q = useQuery({
    queryKey: ["channel-routing", channelId],
    queryFn: () => getRouting({ data: { channelId } }),
  });

  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showNewDept, setShowNewDept] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data) {
      setDepartmentId(q.data.channel.department_id);
      setSelected(new Set(q.data.assignedMemberIds));
      setDirty(false);
    }
  }, [q.data]);

  const departments = q.data?.departments ?? [];
  const members = q.data?.members ?? [];

  const sortedMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = members.filter((m) => {
      if (!term) return true;
      return (
        (m.full_name ?? "").toLowerCase().includes(term) ||
        (m.email ?? "").toLowerCase().includes(term)
      );
    });
    return list.sort((a, b) => {
      // priority: assigned > same dept > active > name
      const aAssigned = selected.has(a.user_id) ? 0 : 1;
      const bAssigned = selected.has(b.user_id) ? 0 : 1;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      const aDept = departmentId && a.department_id === departmentId ? 0 : 1;
      const bDept = departmentId && b.department_id === departmentId ? 0 : 1;
      if (aDept !== bDept) return aDept - bDept;
      const aAct = a.status === "active" ? 0 : 1;
      const bAct = b.status === "active" ? 0 : 1;
      if (aAct !== bAct) return aAct - bAct;
      return (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "");
    });
  }, [members, search, selected, departmentId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveRouting({
        data: {
          channelId,
          departmentId: departmentId,
          memberIds: Array.from(selected),
        },
      }),
    onSuccess: () => {
      toast.success("Roteamento atualizado com sucesso.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["channel-routing", channelId] });
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar."),
  });

  const createDeptMut = useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      createDept({ data: { name: input.name, description: input.description || null } }),
    onSuccess: (row: any) => {
      toast.success(`Setor "${row.name}" criado.`);
      setDepartmentId(row.id);
      setDirty(true);
      setShowNewDept(false);
      qc.invalidateQueries({ queryKey: ["channel-routing", channelId] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível criar o setor."),
  });

  if (q.isPending) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando roteamento...
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" /> Não foi possível carregar o roteamento deste canal.
        </div>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => q.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Roteamento do canal
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Defina qual setor e quais membros da equipe serão responsáveis pelos atendimentos recebidos neste canal.
        </p>
      </div>

      {/* Setor */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Setor responsável</Label>
        {departments.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Nenhum setor criado ainda.</p>
            <Button size="sm" variant="outline" onClick={() => setShowNewDept(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar primeiro setor
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Select
              value={departmentId ?? "none"}
              onValueChange={(v) => {
                setDepartmentId(v === "none" ? null : v);
                setDirty(true);
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem setor definido</SelectItem>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color ?? "#3B82F6" }} />
                      {d.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setShowNewDept(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar setor
            </Button>
          </div>
        )}
      </div>

      {/* Membros */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Membros responsáveis
          </Label>
          <span className="text-xs text-muted-foreground">{selected.size} selecionado(s)</span>
        </div>

        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Nenhum membro disponível.</p>
            <Button size="sm" variant="outline" asChild>
              <Link to="/team">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar membro à equipe
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar membro..."
                className="pl-8 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="rounded-xl border divide-y max-h-[360px] overflow-y-auto">
              {sortedMembers.map((m) => {
                const inDept = departmentId && m.department_id === departmentId;
                const initials = (m.full_name ?? m.email ?? "?").slice(0, 2).toUpperCase();
                const isInactive = m.status !== "active";
                return (
                  <label
                    key={m.user_id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(m.user_id)}
                      onCheckedChange={() => toggle(m.user_id)}
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm truncate ${isInactive ? "text-muted-foreground line-through" : "font-medium"}`}>
                          {m.full_name ?? m.email}
                        </p>
                        {inDept && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">do setor</Badge>
                        )}
                        {isInactive && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1">inativo</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {m.job_title || m.email}
                      </p>
                    </div>
                  </label>
                );
              })}
              {sortedMembers.length === 0 && (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  Nenhum membro corresponde à busca.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Ações */}
      <div className="flex justify-end gap-2 border-t pt-4 sticky bottom-0 bg-background">
        <Button
          variant="outline"
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => {
            if (q.data) {
              setDepartmentId(q.data.channel.department_id);
              setSelected(new Set(q.data.assignedMemberIds));
              setDirty(false);
            }
          }}
        >
          Cancelar
        </Button>
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
          Salvar roteamento
        </Button>
      </div>

      <NewDepartmentDialog
        open={showNewDept}
        onOpenChange={setShowNewDept}
        onSubmit={(name, description) => createDeptMut.mutate({ name, description })}
        pending={createDeptMut.isPending}
      />
    </div>
  );
}

function NewDepartmentDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (name: string, description: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  const canSubmit = name.trim().length >= 2 && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar novo setor</DialogTitle>
          <DialogDescription>
            Setores organizam a equipe por área de atuação (Comercial, Financeiro, Jurídico...).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do setor *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Comercial"
              maxLength={60}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Área responsável por vendas e novos clientes."
              rows={3}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => onSubmit(name.trim(), description.trim())}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            Criar setor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
