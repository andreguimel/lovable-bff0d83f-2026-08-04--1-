import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus, ChevronRight, Sparkles, Eye, EyeOff, Copy, CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { createDirectTeamMember } from "@/lib/team.functions";
import { ROLE_CATALOG } from "./constants";

function generatePassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  let pass = "";
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export function InviteWizard({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [jobTitle, setJobTitle] = useState("");

  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    password: string;
    fullName: string;
    role: string;
  } | null>(null);

  const qc = useQueryClient();
  const createMemberFn = useServerFn(createDirectTeamMember);

  const createMut = useMutation({
    mutationFn: () =>
      createMemberFn({
        data: {
          email,
          password,
          fullName,
          role,
          jobTitle: jobTitle || undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success("Membro cadastrado com sucesso!");
      qc.invalidateQueries({ queryKey: ["team-overview"] });
      setCreatedCredentials({
        email: res.email,
        password: res.password,
        fullName: res.fullName,
        role: res.role === "admin" ? "Administrador" : "Operador",
      });
      setStep(3); // Tela de conclusão e cópia de credenciais
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar membro");
    },
  });

  const resetForm = () => {
    setStep(0);
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("agent");
    setJobTitle("");
    setCreatedCredentials(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const copyCredentials = () => {
    if (!createdCredentials) return;
    const text = `Credenciais de acesso ao sistema:\nNome: ${createdCredentials.fullName}\nE-mail: ${createdCredentials.email}\nSenha: ${createdCredentials.password}\nFunção: ${createdCredentials.role}`;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Credenciais copiadas para a área de transferência!"))
      .catch(() => toast.error("Falha ao copiar credenciais"));
  };

  const steps = ["Credenciais", "Cargo & Função", "Revisar"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Cadastrar Novo Membro
          </DialogTitle>
        </DialogHeader>

        {!createdCredentials ? (
          <>
            <div className="flex items-center gap-1 text-xs">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <span
                    className={`rounded-md px-2 py-1 ${
                      i === step ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {s}
                  </span>
                  {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              {step === 0 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="create-member-name">Nome Completo</Label>
                    <Input
                      id="create-member-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ex.: Carlos Silva"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-member-email">E-mail de Login</Label>
                    <Input
                      id="create-member-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="carlos@empresa.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="create-member-password">Senha de Acesso</Label>
                      <button
                        type="button"
                        onClick={() => setPassword(generatePassword())}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <KeyRound className="h-3 w-3" /> Gerar Senha Forte
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="create-member-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Cargo / Permissão</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLE_CATALOG.slice(0, 6).map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => setRole(r.key === "admin" ? "admin" : "agent")}
                          className={`rounded-xl border p-3 text-left transition ${
                            (role === "admin" && r.key === "admin") || (role === "agent" && r.key !== "admin")
                              ? "border-primary bg-primary/5"
                              : "border-border/60"
                          }`}
                        >
                          <div className="text-xs font-medium">{r.name}</div>
                          <div className="text-[11px] text-muted-foreground">{r.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-member-jobtitle">Título do Cargo (opcional)</Label>
                    <Input
                      id="create-member-jobtitle"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Ex.: Especialista de Atendimento"
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nome</span>
                    <span className="font-medium">{fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">E-mail</span>
                    <span className="font-medium">{email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Senha</span>
                    <span className="font-mono">{showPassword ? password : "••••••••"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Função</span>
                    <span className="font-medium">{role === "admin" ? "Administrador" : "Operador"}</span>
                  </div>
                  {jobTitle && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cargo</span>
                      <span>{jobTitle}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <div className="flex w-full justify-between">
                <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
                  Voltar
                </Button>
                {step < steps.length - 1 ? (
                  <Button
                    onClick={() => setStep(step + 1)}
                    disabled={step === 0 && (!fullName.trim() || !email.trim() || password.length < 6)}
                  >
                    Próximo
                  </Button>
                ) : (
                  <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                    <UserPlus className="mr-2 h-4 w-4" /> Criar Usuário Imediatamente
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-500">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Membro Cadastrado com Sucesso!</p>
                <p className="text-xs text-muted-foreground">
                  O usuário já pode realizar login no sistema com as credenciais abaixo.
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4 text-sm">
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Nome:</span>
                <span className="font-semibold">{createdCredentials.fullName}</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">E-mail (Login):</span>
                <span className="font-mono font-medium">{createdCredentials.email}</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Senha:</span>
                <span className="font-mono font-bold text-primary">{createdCredentials.password}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Perfil de Acesso:</span>
                <span className="font-medium">{createdCredentials.role}</span>
              </div>
            </div>

            <DialogFooter>
              <div className="flex w-full justify-between gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Fechar
                </Button>
                <Button onClick={copyCredentials}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar Credenciais
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

