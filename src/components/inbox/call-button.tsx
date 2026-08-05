import { Phone, PhoneCall, Copy, MessageCircle } from "lucide-react";
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
 * Ligação para o contato do inbox.
 *
 * A Stevo não expõe endpoint de chamada (WhatsApp não permite originar
 * chamadas por API), então a ação abre o discador do dispositivo ou o
 * WhatsApp, onde a chamada de voz pode ser iniciada.
 */
export function CallButton({ phone, contactName, variant = "icon", className }: CallButtonProps) {
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {contactName ? `${contactName} · ` : ""}
          {formatPhone(digits)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => open(`tel:+${digits}`)}>
          <PhoneCall className="mr-2 h-4 w-4" />
          Ligar pelo telefone
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(`https://wa.me/${digits}`)}>
          <MessageCircle className="mr-2 h-4 w-4" />
          Chamada de voz no WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copy()}>
          <Copy className="mr-2 h-4 w-4" />
          Copiar número
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
