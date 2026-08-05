/**
 * Bottom sheet with per-message actions on mobile (long-press trigger).
 * WhatsApp-Business style: Responder, Encaminhar, Copiar, Selecionar,
 * Excluir para mim, Excluir para todos, Cancelar.
 *
 * Reuses the same delete capability contract as the desktop
 * `MessageActions` component.
 */
import { useEffect } from "react";
import {
  Reply,
  Forward,
  Copy,
  CheckSquare,
  Trash2,
  Info,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DeleteCapabilities } from "@/lib/message-delete.functions";

export type MobileDeleteScope = "inbox_only" | "for_me" | "for_everyone";

export interface MobileMessageActionsSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: {
    id: string;
    body: string | null;
    outbound: boolean;
    deleted: boolean;
    type?: "text" | "image" | "audio" | "video" | "file";
    media_metadata?: unknown;
  } | null;
  capabilities: DeleteCapabilities | null;
  canDelete: boolean;
  /** Trigger a quoted reply. When provided, the "Responder" item becomes the primary action. */
  onReply: () => void;
  /** Open forward dialog for this single message. */
  onForward: (id: string) => void;
  /** Open the "Message info" bottom sheet for this single message. */
  onInfo: (id: string) => void;
  onEnterSelect: (id: string) => void;
  onDelete: (id: string, scope: MobileDeleteScope) => void;
}


export function MobileMessageActionsSheet({
  open,
  onOpenChange,
  message,
  capabilities,
  canDelete,
  onReply,
  onForward,
  onInfo,
  onEnterSelect,
  onDelete,
}: MobileMessageActionsSheetProps) {

  // Vibrate on open for tactile feedback (best-effort, safe no-op on iOS).
  useEffect(() => {
    if (open && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(15);
      } catch {
        /* noop */
      }
    }
  }, [open]);

  if (!message) return null;

  const canForEveryone =
    canDelete && message.outbound && (capabilities?.supportsForEveryone ?? false);
  const canForMe = canDelete && (capabilities?.supportsForMe ?? true);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.body ?? "");
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
    onOpenChange(false);
  };

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-border/60 p-0 pb-[env(safe-area-inset-bottom)]"
        aria-label="Ações da mensagem"
      >
        <SheetHeader className="border-b border-border/40 px-5 py-3 text-left">
          <SheetTitle className="text-[15px] font-semibold">
            Ações da mensagem
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col py-1">
          <SheetAction
            icon={<Reply className="h-5 w-5" />}
            label="Responder"
            onClick={() => {
              onReply();
              close();
            }}
          />
          <SheetAction
            icon={<Forward className="h-5 w-5" />}
            label="Encaminhar"
            onClick={() => {
              onForward(message.id);
              close();
            }}
          />

          <SheetAction
            icon={<Copy className="h-5 w-5" />}
            label="Copiar"
            disabled={!message.body}
            onClick={handleCopy}
          />
          <SheetAction
            icon={<Info className="h-5 w-5" />}
            label="Informações da mensagem"
            onClick={() => {
              onInfo(message.id);
              close();
            }}
          />
          <SheetAction
            icon={<CheckSquare className="h-5 w-5" />}
            label="Selecionar mensagens"
            onClick={() => {
              onEnterSelect(message.id);
              close();
            }}
          />


          {canDelete && (
            <>
              <div className="my-1 h-px bg-border/50" />
              {canForMe && (
                <SheetAction
                  icon={<Trash2 className="h-5 w-5" />}
                  label="Excluir para mim"
                  hint={capabilities?.reasonForMe}
                  destructive
                  onClick={() => {
                    onDelete(message.id, "for_me");
                    close();
                  }}
                />
              )}
              <SheetAction
                icon={<Trash2 className="h-5 w-5" />}
                label="Excluir para todos"
                disabled={!canForEveryone}
                hint={
                  !canForEveryone
                    ? message.outbound
                      ? capabilities?.reasonForEveryone ?? "Provedor não suporta."
                      : "Apenas mensagens enviadas por você."
                    : undefined
                }
                destructive
                onClick={() => {
                  if (!canForEveryone) return;
                  onDelete(message.id, "for_everyone");
                  close();
                }}
              />
              <SheetAction
                icon={<Trash2 className="h-5 w-5" />}
                label="Remover apenas do inbox"
                onClick={() => {
                  onDelete(message.id, "inbox_only");
                  close();
                }}
              />
            </>
          )}

          <div className="my-1 h-px bg-border/50" />
          <SheetAction
            icon={<X className="h-5 w-5" />}
            label="Cancelar"
            onClick={close}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SheetAction({
  icon,
  label,
  hint,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-[52px] w-full items-center gap-4 px-5 text-left text-[15px] transition-colors",
        "active:bg-accent/70",
        disabled && "opacity-50",
        destructive && !disabled && "text-destructive",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">
        <span className="block leading-tight">{label}</span>
        {hint && (
          <span className="block text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  );
}
