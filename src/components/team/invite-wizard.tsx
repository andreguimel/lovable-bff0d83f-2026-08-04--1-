import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { inviteTeamMember } from "@/lib/team.functions";
import { ROLE_CATALOG } from "./constants";

export function InviteWizard({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [dept, setDept] = useState("");
  const [queue, setQueue] = useState("");

  const inviteFn = useServerFn(inviteTeamMember);
  const m = useMutation({
    mutationFn: () => inviteFn({ data: { email, role } }),
    onSuccess: () => { toast.success("Convite enviado"); setOpen(false); setStep(0); setEmail(""); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const steps = ["Dados", "Cargo", "Departamento", "Fila", "Revisar"];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Convidar colaborador</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 text-xs">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <span className={`px-2 py-1 rounded-md ${i === step ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <div className="space-y-3 pt-2">
          {step === 0 && (
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
            </div>
          )}
          {step === 1 && (
            <div className="space-y-2">
              <Label>Cargo</Label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_CATALOG.slice(0, 6).map((r) => (
                  <button key={r.key} onClick={() => setRole(r.key === "admin" ? "admin" : "agent")}
                    className={`p-3 rounded-xl border text-left transition ${(role === "admin" && r.key === "admin") || (role === "agent" && r.key !== "admin") ? "border-primary bg-primary/5" : "border-border/60"}`}>
                    <div className="text-xs font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-2">
              <Label>Departamento (opcional)</Label>
              <Input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Ex.: Comercial" />
            </div>
          )}
          {step === 3 && (
            <div className="space-y-2">
              <Label>Fila (opcional)</Label>
              <Input value={queue} onChange={(e) => setQueue(e.target.value)} placeholder="Ex.: Atendimento" />
            </div>
          )}
          {step === 4 && (
            <div className="rounded-xl border border-border/60 p-4 space-y-2 bg-muted/30 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cargo</span><span>{role === "admin" ? "Administrador" : "Operador"}</span></div>
              {dept && <div className="flex justify-between"><span className="text-muted-foreground">Depto</span><span>{dept}</span></div>}
              {queue && <div className="flex justify-between"><span className="text-muted-foreground">Fila</span><span>{queue}</span></div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex justify-between w-full">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !email}>Próximo</Button>
            ) : (
              <Button onClick={() => m.mutate()} disabled={m.isPending}>
                <Mail className="h-4 w-4 mr-2" /> Enviar convite
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
