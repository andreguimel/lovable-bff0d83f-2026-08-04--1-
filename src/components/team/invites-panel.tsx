import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Copy, RefreshCw, X, CheckCircle2, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { resendInvite, cancelInvite } from "@/lib/team.functions";

type Invite = {
  id: string; email: string; role: string; status?: string;
  created_at: string; expires_at?: string; token?: string | null;
  sent_count?: number; last_sent_at?: string;
};

export function InvitesPanel({ invites }: { invites: Invite[] }) {
  const qc = useQueryClient();

  const resendFn = useServerFn(resendInvite);
  const resendM = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id } }),
    onSuccess: (res: any) => {
      const url = `${window.location.origin}/invite/${res.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Convite reenviado — link copiado");
      qc.invalidateQueries({ queryKey: ["team-overview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const cancelFn = useServerFn(cancelInvite);
  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => { toast.success("Convite cancelado"); qc.invalidateQueries({ queryKey: ["team-overview"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  function copyLink(token: string | null | undefined) {
    if (!token) { toast.error("Token indisponível — reenvie o convite"); return; }
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado")).catch(() => toast.error("Falha ao copiar"));
  }

  const pending = invites.filter((i) => (i.status ?? "pending") === "pending");
  const other = invites.filter((i) => (i.status ?? "pending") !== "pending");

  if (invites.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-xl">
        Nenhum convite. Clique em "Convidar" acima para enviar o primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {pending.map((inv) => {
          const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
          return (
            <div key={inv.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3 bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {inv.email}
                    <Badge variant="outline" className="text-[10px]">{inv.role}</Badge>
                    {expired && <Badge variant="destructive" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />expirado</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Enviado {new Date(inv.last_sent_at ?? inv.created_at).toLocaleDateString("pt-BR")}
                    {inv.sent_count ? ` · ${inv.sent_count}x` : ""}
                    {inv.expires_at ? ` · expira ${new Date(inv.expires_at).toLocaleDateString("pt-BR")}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => copyLink(inv.token)}><Copy className="h-4 w-4 mr-1" />Link</Button>
                <Button size="sm" variant="ghost" onClick={() => resendM.mutate(inv.id)} disabled={resendM.isPending}>
                  <RefreshCw className="h-4 w-4 mr-1" />Reenviar
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive"><X className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancelar convite?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O link será invalidado imediatamente e não poderá mais ser usado.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Manter</AlertDialogCancel>
                      <AlertDialogAction onClick={() => cancelM.mutate(inv.id)}>Cancelar convite</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>

      {other.length > 0 && (
        <details className="rounded-xl border border-border/60 bg-card p-3">
          <summary className="text-xs text-muted-foreground cursor-pointer">Histórico de convites ({other.length})</summary>
          <div className="mt-2 space-y-1.5">
            {other.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-xs p-2">
                <div className="flex items-center gap-2">
                  {inv.status === "accepted" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <X className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span>{inv.email}</span>
                  <Badge variant="outline" className="text-[10px]">{inv.status}</Badge>
                </div>
                <span className="text-muted-foreground">{new Date(inv.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
