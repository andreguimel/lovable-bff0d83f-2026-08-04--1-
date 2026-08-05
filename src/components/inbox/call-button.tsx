import { useState } from "react";
import { Phone, PhoneCall, Copy, MessageCircle, Grid3x3 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { WebDialerDialog } from "./web-dialer-dialog";

/** Somente dígitos, no formato aceito por links tel:/WhatsApp. */
function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

function formatPhone(raw: string): string {
  const d = normalizePhone(raw);
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return raw;
}

interface CallButtonProps {
  phone: string | null | undefined;
  contactName?: string;
  /** `icon` para header compacto, `button` para rótulo visível. */
  variant?: "icon" | "button";
  className?: string;
}

/**
 * Ligação para o contato do inbox via Stevo Voice (SIP), discador web e app de voz.
 */
export function CallButton({ phone, contactName, variant = "icon", className }: CallButtonProps) {
  const [dialerOpen, setDialerOpen] = useState(false);
  const digits = phone ? normalizePhone(phone) : "";
  const disabled = digits.length < 8;

  const open = (url: string) => {
    window.open(url, "_self");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`+${digits}`);
      toast.success("Número copiado");
    } catch {
      toast.error("Não foi possível copiar o número");
    }
  };

  const trigger =
    variant === "icon" ? (
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={cn("h-8 w-8 rounded-lg", className)}
        aria-label="Ligar para o contato"
        title={disabled ? "Contato sem telefone" : "Ligar"}
      >
        <Phone className="h-4 w-4" />
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        className={cn("h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs", className)}
      >
        <Phone className="h-3.5 w-3.5" />
        Ligar
      </Button>
    );

  if (disabled) return trigger;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
            {contactName ? `${contactName} · ` : ""}
            {formatPhone(digits)}
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => open(`sip:+${digits}`)}>
            <PhoneCall className="mr-2 h-4 w-4 text-emerald-600" />
            Ligar via Stevo Voice (SIP)
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setDialerOpen(true)}>
            <Grid3x3 className="mr-2 h-4 w-4 text-primary" />
            Discador Web Zenda
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => open(`https://wa.me/${digits}`)}>
            <MessageCircle className="mr-2 h-4 w-4 text-sky-500" />
            Chamada de voz no WhatsApp
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => open(`tel:+${digits}`)}>
            <Phone className="mr-2 h-4 w-4 text-muted-foreground" />
            Telefone do dispositivo
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => void copy()}>
            <Copy className="mr-2 h-4 w-4 text-muted-foreground" />
            Copiar número
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WebDialerDialog
        open={dialerOpen}
        onOpenChange={setDialerOpen}
        phone={digits}
        contactName={contactName}
      />
    </>
  );
}
