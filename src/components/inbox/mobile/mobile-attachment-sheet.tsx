import { Camera, FileText, Image as ImageIcon, Mic, Video } from "lucide-react";
import type { ComponentType } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Kind = "camera" | "gallery" | "video" | "file" | "audio";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (kind: Kind) => void;
}

/**
 * Mobile bottom-sheet with attachment options. Delegates the actual pickers
 * to the parent composer (which owns the file inputs and audio recorder).
 */
export function MobileAttachmentSheet({ open, onOpenChange, onPick }: Props) {
  const items: Array<{ kind: Kind; label: string; icon: ComponentType<{ className?: string }>; tint: string }> = [
    { kind: "camera", label: "Câmera", icon: Camera, tint: "bg-primary/15 text-primary" },
    { kind: "gallery", label: "Galeria", icon: ImageIcon, tint: "bg-success/15 text-success" },
    { kind: "video", label: "Vídeo", icon: Video, tint: "bg-warning/15 text-warning" },
    { kind: "file", label: "Documento", icon: FileText, tint: "bg-info/15 text-info" },
    { kind: "audio", label: "Áudio", icon: Mic, tint: "bg-destructive/15 text-destructive" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),1rem)]">
        <SheetHeader>
          <SheetTitle>Anexar</SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {items.map((it) => (
            <button
              key={it.kind}
              type="button"
              onClick={() => {
                onPick(it.kind);
                onOpenChange(false);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl p-3 active:bg-accent/60"
            >
              <span className={`grid h-14 w-14 place-items-center rounded-2xl ${it.tint}`}>
                <it.icon className="h-6 w-6" />
              </span>
              <span className="text-[12px] font-medium text-foreground">{it.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
