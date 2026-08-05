/**
 * Confirmation dialog for message deletion. Presents scope, count and
 * provider caveats before invoking the server function.
 */
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DeleteCapabilities } from "@/lib/message-delete.functions";

type Scope = "inbox_only" | "for_me" | "for_everyone";

interface Props {
  open: boolean;
  scope: Scope | null;
  count: number;
  capabilities: DeleteCapabilities | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const TITLES: Record<Scope, string> = {
  inbox_only: "Remover apenas do inbox?",
  for_me: "Excluir para mim?",
  for_everyone: "Excluir para todos?",
};

const DESCRIPTIONS: Record<Scope, string> = {
  inbox_only:
    "A mensagem será ocultada do inbox da sua empresa. O contato continua vendo normalmente e nada é enviado ao provedor.",
  for_me:
    "A mensagem será removida do lado da empresa. Dependendo do provedor, isso pode ser apenas local.",
  for_everyone:
    "A mensagem será revogada para o contato. Só funciona dentro da janela do WhatsApp (~2 dias) e em provedores compatíveis.",
};

export function DeleteMessageDialog({
  open,
  scope,
  count,
  capabilities,
  loading,
  onCancel,
  onConfirm,
}: Props) {
  const s: Scope = scope ?? "inbox_only";
  const caveat =
    s === "for_everyone"
      ? capabilities?.reasonForEveryone
      : s === "for_me"
        ? capabilities?.reasonForMe
        : undefined;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {TITLES[s]}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {count > 1
                  ? `${count} mensagens selecionadas.`
                  : "1 mensagem selecionada."}{" "}
                {DESCRIPTIONS[s]}
              </p>
              {caveat && (
                <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                  {caveat}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Excluindo…" : "Confirmar exclusão"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
