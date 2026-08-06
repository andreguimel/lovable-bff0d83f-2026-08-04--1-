import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, MoreVertical, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CallButton } from "@/components/inbox/call-button";
import { cn } from "@/lib/utils";

export interface Props {
  conversationId?: string;
  contactName: string;
  contactPhone?: string | null;
  channelName?: string | null;
  status: "open" | "pending" | "resolved";
  onOpenContact: () => void;
  onOpenAssign: () => void;
  onToggleStatus: () => void;
}

/**
 * Mobile conversation header — 56px, back button, avatar/name (tap → contact
 * sheet), status dot, and a "more" menu. All actions delegate to the parent
 * so no business logic changes.
 */
export function MobileConversationHeader({
  conversationId,
  contactName,
  contactPhone,
  channelName,
  status,
  onOpenContact,
  onOpenAssign,
  onToggleStatus,
}: Props) {
  const navigate = useNavigate();
  const initial = contactName.charAt(0).toUpperCase();
  const statusLabel = status === "open" ? "Aberta" : status === "pending" ? "Pendente" : "Resolvida";
  const statusColor =
    status === "open" ? "bg-success" : status === "pending" ? "bg-warning" : "bg-muted-foreground";

  return (
    <header className="flex h-14 w-full items-center justify-between border-b bg-card px-2 shadow-xs sm:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate({ to: "/inbox" })}
        className="h-11 w-11 shrink-0 rounded-full"
        aria-label="Voltar para conversas"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <button
        type="button"
        onClick={onOpenContact}
        className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left active:opacity-70"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-primary text-[13px] font-semibold text-primary-foreground ring-1 ring-border/40">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight text-foreground">{contactName}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusColor)} />
            <span className="truncate">{statusLabel}{channelName ? ` · ${channelName}` : contactPhone ? ` · ${contactPhone}` : ""}</span>
          </p>
        </div>
      </button>

      <CallButton conversationId={conversationId} phone={contactPhone} contactName={contactName} className="h-11 w-11 rounded-full" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais" className="h-11 w-11 rounded-full">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={onOpenContact}>Detalhes do contato</DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenAssign}>
            <UserCog className="mr-2 h-4 w-4" /> Atribuir
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onToggleStatus}>
            <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
            {status === "resolved" ? "Reabrir" : "Resolver"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
