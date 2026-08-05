import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { User, Key, Building2, ListOrdered, Radio, Bot, Tag, History, Activity, Monitor, Smartphone, Save } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/states/loading-state";
import { EntityHistoryTimeline } from "@/components/history/EntityHistoryTimeline";
import { getMemberEffectivePermissions, updateMemberOverrides } from "@/lib/rbac.functions";
import { MODULE_LABELS } from "@/lib/rbac/registry";

interface MemberSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member: any | null;
}

export function MemberSheet({ open, onOpenChange, member }: MemberSheetProps) {
  if (!member) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto p-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={member.avatar_url ?? undefined} />
              <AvatarFallback>{(member.full_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="truncate">{member.full_name ?? member.email}</SheetTitle>
              <SheetDescription className="truncate text-xs">
                {member.email} · <Badge variant="outline" className="text-[10px]">{member.role ?? "agent"}</Badge>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="sticky top-0 z-10 flex w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-background/95 px-2 backdrop-blur">
            <TabsTrigger value="profile"><User className="mr-1 h-3.5 w-3.5" />Perfil</TabsTrigger>
            <TabsTrigger value="permissions"><Key className="mr-1 h-3.5 w-3.5" />Permissões</TabsTrigger>
            <TabsTrigger value="departments"><Building2 className="mr-1 h-3.5 w-3.5" />Depts</TabsTrigger>
            <TabsTrigger value="queues"><ListOrdered className="mr-1 h-3.5 w-3.5" />Filas</TabsTrigger>
            <TabsTrigger value="channels"><Radio className="mr-1 h-3.5 w-3.5" />Canais</TabsTrigger>
            <TabsTrigger value="agents"><Bot className="mr-1 h-3.5 w-3.5" />Agentes</TabsTrigger>
            <TabsTrigger value="tags"><Tag className="mr-1 h-3.5 w-3.5" />Tags</TabsTrigger>
            <TabsTrigger value="history"><History className="mr-1 h-3.5 w-3.5" />Histórico</TabsTrigger>
            <TabsTrigger value="activities"><Activity className="mr-1 h-3.5 w-3.5" />Atividades</TabsTrigger>
            <TabsTrigger value="sessions"><Monitor className="mr-1 h-3.5 w-3.5" />Sessões</TabsTrigger>
            <TabsTrigger value="devices"><Smartphone className="mr-1 h-3.5 w-3.5" />Dispositivos</TabsTrigger>
          </TabsList>

          <div className="p-4">
            <TabsContent value="profile"><ProfileTab member={member} /></TabsContent>
            <TabsContent value="permissions"><PermissionsTab member={member} /></TabsContent>
            <TabsContent value="departments"><PlaceholderTab label="Departamentos" hint="Vincule este membro aos departamentos aplicáveis." /></TabsContent>
            <TabsContent value="queues"><PlaceholderTab label="Filas" hint="Prioridade e capacidade por fila." /></TabsContent>
            <TabsContent value="channels"><PlaceholderTab label="Canais" hint="Canais que o membro pode operar." /></TabsContent>
            <TabsContent value="agents"><PlaceholderTab label="Agentes IA" hint="Agentes IA autorizados para este membro." /></TabsContent>
            <TabsContent value="tags"><PlaceholderTab label="Tags de perfil" hint="Marcadores internos (ex: seniority, especialidade)." /></TabsContent>
            <TabsContent value="history"><EntityHistoryTimeline entity="member" entityId={member.id} showFilters={false} /></TabsContent>
            <TabsContent value="activities"><EntityHistoryTimeline showFilters={false} /></TabsContent>
            <TabsContent value="sessions"><PlaceholderTab label="Sessões ativas" hint="Requer integração com Auth Admin (sb_secret)." /></TabsContent>
            <TabsContent value="devices"><PlaceholderTab label="Dispositivos" hint="Derivado de user-agent das sessões." /></TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ProfileTab({ member }: { member: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div><Label>Nome</Label><Input defaultValue={member.full_name ?? ""} /></div>
      <div><Label>Email</Label><Input defaultValue={member.email ?? ""} disabled /></div>
      <div><Label>Cargo interno</Label><Input defaultValue={member.job_title ?? ""} /></div>
      <div><Label>Telefone</Label><Input defaultValue={member.phone ?? ""} /></div>
      <div className="col-span-2"><Label>Observações</Label><Textarea defaultValue={member.notes ?? ""} rows={3} /></div>
      <div className="col-span-2 text-right">
        <Button size="sm"><Save className="mr-1 h-3.5 w-3.5" /> Salvar perfil</Button>
      </div>
    </div>
  );
}

function PermissionsTab({ member }: { member: any }) {
  const qc = useQueryClient();
  const fn = useServerFn(getMemberEffectivePermissions);
  const saveFn = useServerFn(updateMemberOverrides);
  const q = useQuery({
    queryKey: ["member-perms", member.id],
    queryFn: () => fn({ data: { userId: member.id } }),
  });
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());

  const grouped = useMemo(() => {
    const g = new Map<string, any[]>();
    for (const p of q.data ?? []) {
      if (!g.has(p.module)) g.set(p.module, []);
      g.get(p.module)!.push(p);
    }
    return Array.from(g.entries());
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => saveFn({
      data: {
        userId: member.id,
        overrides: Array.from(pending, ([permission_key, granted]) => ({ permission_key, granted })),
      },
    }),
    onSuccess: () => {
      toast.success("Overrides salvos");
      setPending(new Map());
      qc.invalidateQueries({ queryKey: ["member-perms", member.id] });
      qc.invalidateQueries({ queryKey: ["rbac"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  if (q.isPending) return <LoadingState rows={6} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Permissões efetivas = <span className="font-mono">herdada + override</span>
        </div>
        <Button size="sm" disabled={pending.size === 0 || save.isPending} onClick={() => save.mutate()}>
          <Save className="mr-1 h-3.5 w-3.5" /> Salvar overrides ({pending.size})
        </Button>
      </div>
      {grouped.map(([mod, perms]) => (
        <div key={mod} className="rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold">{MODULE_LABELS[mod] ?? mod}</div>
          <div className="divide-y divide-border">
            {perms.map((p) => {
              const effective = pending.has(p.key) ? pending.get(p.key)! : p.effective;
              return (
                <div key={p.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{p.label ?? p.key}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{p.key}</div>
                  </div>
                  <Badge variant={p.inherited ? "secondary" : "outline"} className="text-[10px]">
                    Herdada: {p.inherited ? "sim" : "não"}
                  </Badge>
                  <Badge variant={p.override ? "default" : "outline"} className="text-[10px]">
                    Override: {p.override ? (p.override.granted ? "concede" : "revoga") : "—"}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Final</span>
                    <Checkbox
                      checked={effective}
                      onCheckedChange={(v) => {
                        const next = new Map(pending);
                        next.set(p.key, !!v);
                        setPending(next);
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlaceholderTab({ label, hint }: { label: string; hint: string }) {
  return (
    <EmptyState
      icon={User}
      title={label}
      description={`${hint} — em breve nesta aba.`}
    />
  );
}
