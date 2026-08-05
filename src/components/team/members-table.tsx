import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreHorizontal, UserCog, Shield, Power, PowerOff, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { PRESENCE_LABEL } from "./constants";
import { updateMemberRole, setMemberStatus, removeMember } from "@/lib/team.functions";
import { MemberSheet } from "./member-sheet";

export function MembersTable({ members }: { members: any[] }) {
  const qc = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState<any | null>(null);
  const [sheetMember, setSheetMember] = useState<any | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["team-overview"] });

  const roleFn = useServerFn(updateMemberRole);
  const roleM = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "agent" }) => roleFn({ data: v }),
    onSuccess: () => { toast.success("Cargo atualizado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const statusFn = useServerFn(setMemberStatus);
  const statusM = useMutation({
    mutationFn: (v: { userId: string; status: "active" | "inactive" }) => statusFn({ data: v }),
    onSuccess: (_d, v) => { toast.success(v.status === "active" ? "Membro reativado" : "Membro desativado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const removeFn = useServerFn(removeMember);
  const removeM = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { userId } }),
    onSuccess: () => { toast.success("Membro removido"); setConfirmRemove(null); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <>
      <div className="rounded-2xl border border-border/60 overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membro</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Depto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Filas</TableHead>
              <TableHead className="text-right">Conversas</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id} className="hover:bg-muted/40">
                <TableCell>
                  <button type="button" onClick={() => setSheetMember(m)} className="flex items-center gap-2 text-left hover:underline">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">{(m.full_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">{m.full_name ?? m.email}</div>
                      <div className="text-[11px] text-muted-foreground">{m.email}</div>
                    </div>
                  </button>
                </TableCell>
                <TableCell className="text-xs">{m.job_title ?? m.role}</TableCell>
                <TableCell>{m.department && <Badge variant="outline" style={{ color: m.department.color }}>{m.department.name}</Badge>}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="presence-dot" data-status={m.presence.status} />
                    {PRESENCE_LABEL[m.presence.status]}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{m.queues.join(", ") || "—"}</TableCell>
                <TableCell className="text-right text-sm">{m.stats.open_conversations}</TableCell>
                <TableCell className="text-right text-sm font-semibold">{m.stats.score}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs">{m.full_name ?? m.email}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/team/$memberId" params={{ memberId: m.id }}>
                          <UserCog className="h-4 w-4 mr-2" />Editar perfil
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] text-muted-foreground">Cargo</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => roleM.mutate({ userId: m.id, role: "admin" })} disabled={m.role === "admin"}>
                        <Shield className="h-4 w-4 mr-2" />Tornar admin
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => roleM.mutate({ userId: m.id, role: "agent" })} disabled={m.role === "agent"}>
                        <UserCog className="h-4 w-4 mr-2" />Tornar operador
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => statusM.mutate({ userId: m.id, status: "inactive" })}>
                        <PowerOff className="h-4 w-4 mr-2" />Desativar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => statusM.mutate({ userId: m.id, status: "active" })}>
                        <Power className="h-4 w-4 mr-2" />Reativar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setConfirmRemove(m)}>
                        <Trash2 className="h-4 w-4 mr-2" />Remover da equipe
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {confirmRemove?.full_name ?? confirmRemove?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso à empresa é revogado e o perfil arquivado. O usuário pode ser reconvidado depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRemove && removeM.mutate(confirmRemove.id)}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberSheet open={!!sheetMember} onOpenChange={(o) => !o && setSheetMember(null)} member={sheetMember} />
    </>
  );
}
