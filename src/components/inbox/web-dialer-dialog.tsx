import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Phone, PhoneOff, Mic, MicOff, Copy, ShieldCheck, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { startStevoCall } from "@/lib/inbox.functions";

interface WebDialerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  phone?: string | null;
  contactName?: string | null;
  sipServer?: string;
  sipUsername?: string;
}

export function WebDialerDialog({
  open,
  onOpenChange,
  conversationId,
  phone = "",
  contactName = "",
  sipServer = "sm-grilo.stevo.chat:5060",
  sipUsername = "",
}: WebDialerDialogProps) {
  const [dialed, setDialed] = useState(phone?.replace(/[^0-9+]/g, "") ?? "");
  const [calling, setCalling] = useState(false);
  const [muted, setMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    let timer: any = null;
    if (calling) {
      setCallDuration(0);
      timer = setInterval(() => setCallDuration((p) => p + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [calling]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const callStevoFn = useServerFn(startStevoCall);

  const stevoMutation = useMutation({
    mutationFn: async () => {
      const raw = dialed.replace(/[^0-9]/g, "");
      if (raw.length < 8) throw new Error("Digite um número de telefone válido");
      return await callStevoFn({ data: { conversationId, phone: raw } });
    },
    onSuccess: (res) => {
      setCalling(true);
      toast.success(res.message || "Chamada iniciada no Stevo Voice!");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Falha ao disparar ligação no Stevo Voice");
    },
  });

  const handleDigit = (digit: string) => {
    setDialed((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setDialed((prev) => prev.slice(0, -1));
  };

  const handleCopySip = async () => {
    const currentSipServer = stevoMutation.data?.sipServer || sipServer;
    const currentSipUser = stevoMutation.data?.sipUsername || sipUsername;
    try {
      const info = `Servidor: ${currentSipServer}\nUsuário: ${currentSipUser}`;
      await navigator.clipboard.writeText(info);
      toast.success("Credenciais SIP copiadas!");
    } catch {
      toast.error("Erro ao copiar credenciais");
    }
  };

  const handleEndCall = () => {
    setCalling(false);
    toast.success("Chamada encerrada");
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  const activeSipServer = stevoMutation.data?.sipServer || sipServer;
  const activeSipUser = stevoMutation.data?.sipUsername || sipUsername;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-6 sm:max-w-sm">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Phone className="h-6 w-6" />
          </div>
          <DialogTitle className="text-lg">Stevo Voice — Discador Web</DialogTitle>
          <DialogDescription className="text-xs">
            {contactName ? `Chamada via Stevo para ${contactName}` : "Ligação direta via instância Stevo Voice"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Status Badge */}
          <div className="flex items-center justify-center gap-2">
            <Badge
              variant={calling ? "default" : "outline"}
              className={cn("text-xs font-medium px-3 py-1", calling && "animate-pulse bg-emerald-600 text-white")}
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              {calling ? `Em Chamada (${formatDuration(callDuration)})` : "Stevo Voice Pronto"}
            </Badge>
          </div>

          {/* Number Display Input */}
          <div className="relative">
            <Input
              value={dialed}
              onChange={(e) => setDialed(e.target.value)}
              placeholder="+55 (11) 99999-9999"
              className="h-12 text-center text-xl font-bold tracking-wider text-foreground"
            />
            {dialed && (
              <button
                type="button"
                onClick={handleBackspace}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                ⌫
              </button>
            )}
          </div>

          {/* Dialpad Keypad */}
          <div className="grid grid-cols-3 gap-2 px-2">
            {keys.map((k) => (
              <Button
                key={k}
                type="button"
                variant="outline"
                onClick={() => handleDigit(k)}
                className="h-11 text-lg font-semibold hover:bg-primary/10 hover:text-primary active:scale-95"
              >
                {k}
              </Button>
            ))}
          </div>

          {/* Call Options */}
          <div className="space-y-2 pt-1">
            {calling ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={muted ? "destructive" : "outline"}
                    size="icon"
                    onClick={() => setMuted(!muted)}
                    className="h-12 w-12 rounded-full shrink-0"
                    title={muted ? "Ativar microfone" : "Mutar microfone"}
                  >
                    {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    onClick={handleEndCall}
                    className="h-12 flex-1 rounded-full text-sm font-semibold"
                  >
                    <PhoneOff className="mr-2 h-4 w-4" />
                    Encerrar Chamada
                  </Button>
                </div>

              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={stevoMutation.isPending}
                  onClick={() => stevoMutation.mutate()}
                  className="h-12 w-full rounded-full bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 shadow-md"
                >
                  {stevoMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Iniciando Stevo Voice...
                    </>
                  ) : (
                    <>
                      <Phone className="mr-2 h-4 w-4" />
                      Ligar via Stevo Voice
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Softphone Credentials Info Footer */}
          <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Credenciais SIP (Stevo Voice)</span>
              <button
                type="button"
                onClick={handleCopySip}
                className="flex items-center gap-1 font-medium text-primary hover:underline text-[10px]"
              >
                <Copy className="h-3 w-3" />
                Copiar Tudo
              </button>
            </div>
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="truncate">Servidor: {activeSipServer}</span>
            </div>
            {activeSipUser && (
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="truncate">Usuário: {activeSipUser}</span>
              </div>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              Insira o Servidor, Usuário e Senha no MicroSIP, Zoiper ou 3CX para discar diretamente da sua extensão pelo WhatsApp.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
