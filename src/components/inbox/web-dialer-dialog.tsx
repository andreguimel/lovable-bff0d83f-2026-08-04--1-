import { useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Copy, Volume2, Grid3x3, ShieldCheck, MessageCircle, HelpCircle } from "lucide-react";
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

interface WebDialerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone?: string | null;
  contactName?: string | null;
  sipServer?: string;
  sipUsername?: string;
}

export function WebDialerDialog({
  open,
  onOpenChange,
  phone = "",
  contactName = "",
  sipServer = "sm-grilo.stevo.chat:5060",
  sipUsername = "",
}: WebDialerDialogProps) {
  const [dialed, setDialed] = useState(phone?.replace(/[^0-9+]/g, "") ?? "");
  const [calling, setCalling] = useState(false);
  const [muted, setMuted] = useState(false);

  const handleDigit = (digit: string) => {
    setDialed((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setDialed((prev) => prev.slice(0, -1));
  };

  const handleCopySip = async () => {
    try {
      const info = `Servidor: ${sipServer}\nUsuário: ${sipUsername}`;
      await navigator.clipboard.writeText(info);
      toast.success("Credenciais SIP copiadas!");
    } catch {
      toast.error("Erro ao copiar credenciais");
    }
  };

  const handleWaCall = () => {
    const raw = dialed.replace(/[^0-9]/g, "");
    if (raw.length < 8) {
      toast.error("Digite um número de telefone válido");
      return;
    }
    toast.info(`Iniciando chamada para +${raw} no WhatsApp...`);
    window.open(`https://wa.me/${raw}`, "_blank");
  };

  const handleSipCall = () => {
    const raw = dialed.replace(/[^0-9]/g, "");
    if (raw.length < 8) {
      toast.error("Digite um número de telefone válido");
      return;
    }
    setCalling(true);
    toast.info(`Discar +${raw} no Softphone (MicroSIP / Zoiper)...`);
    window.open(`sip:+${raw}`, "_self");
  };

  const handleTelCall = () => {
    const raw = dialed.replace(/[^0-9]/g, "");
    if (raw.length < 8) {
      toast.error("Digite um número de telefone válido");
      return;
    }
    window.open(`tel:+${raw}`, "_self");
  };

  const handleEndCall = () => {
    setCalling(false);
    toast.success("Chamada encerrada");
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-6 sm:max-w-sm">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Phone className="h-6 w-6" />
          </div>
          <DialogTitle className="text-lg">Stevo Voice — Discador Web</DialogTitle>
          <DialogDescription className="text-xs">
            {contactName ? `Chamada para ${contactName}` : "Ligue pelo WhatsApp ou ramal SIP"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Status Badge */}
          <div className="flex items-center justify-center gap-2">
            <Badge
              variant={calling ? "default" : "outline"}
              className={cn("text-xs font-normal", calling && "animate-pulse bg-emerald-600 text-white")}
            >
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              {calling ? "Em Chamada (SIP / WhatsApp)" : "Stevo Voice Pronto"}
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
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={muted ? "destructive" : "outline"}
                  size="icon"
                  onClick={() => setMuted(!muted)}
                  className="h-11 w-11 rounded-full"
                >
                  {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  onClick={handleEndCall}
                  className="h-11 flex-1 rounded-full text-sm font-semibold"
                >
                  <PhoneOff className="mr-2 h-4 w-4" />
                  Encerrar Chamada
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleWaCall}
                  className="h-11 rounded-xl bg-emerald-600 text-xs font-semibold hover:bg-emerald-700 text-white"
                >
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  Voz no WhatsApp
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSipCall}
                  className="h-11 rounded-xl border-border/80 text-xs font-semibold"
                >
                  <Phone className="mr-1.5 h-4 w-4 text-sky-500" />
                  Softphone (SIP)
                </Button>
              </div>
            )}
          </div>

          {/* Softphone Credentials Info Footer */}
          <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Ramal SIP (MicroSIP / Zoiper)</span>
              <button
                type="button"
                onClick={handleCopySip}
                className="flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <Copy className="h-3 w-3" />
                Copiar
              </button>
            </div>
            <p className="mt-1 font-mono text-[10px] truncate">Servidor: {sipServer}</p>
            {sipUsername && <p className="font-mono text-[10px] truncate">Usuário: {sipUsername}</p>}
            <p className="mt-2 text-[10px] text-muted-foreground/80 flex items-start gap-1">
              <HelpCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Dica: Se o Windows abrir o Teams ao clicar em SIP, instale o app gratuito MicroSIP ou Zoiper para discagem em 1 clique.</span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
