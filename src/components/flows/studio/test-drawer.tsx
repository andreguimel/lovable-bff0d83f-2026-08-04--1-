import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FileText } from "lucide-react";
import type { MediaKind } from "@/components/flows/media-picker";

export type TestStep = {
  nodeId: string;
  nodeType: string;
  label: string;
  status: "ok" | "skipped" | "failed";
  durationMs: number;
  message?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

interface Props {
  open: boolean;
  onClose: () => void;
  steps: TestStep[];
  meta: { status: string; error: string | null } | null;
}

export function TestResultDrawer({ open, onClose, steps, meta }: Props) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Playground · Execução</SheetTitle>
          <SheetDescription>
            Timeline passo a passo da execução simulada.{" "}
            {meta && (
              <Badge
                variant={
                  meta.status === "completed"
                    ? "default"
                    : meta.status === "waiting"
                      ? "secondary"
                      : "destructive"
                }
                className="ml-1"
              >
                {meta.status}
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>
        {meta?.error && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {meta.error}
          </div>
        )}
        <ol className="mt-4 space-y-2">
          {steps.length === 0 && (
            <li className="text-xs text-muted-foreground">Nenhum passo executado.</li>
          )}
          {steps.map((s, i) => (
            <li
              key={`${s.nodeId}-${i}`}
              className="rounded-md border border-border/60 bg-card/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold " +
                      (s.status === "ok"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : s.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground")
                    }
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.label}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {s.nodeType} · {s.durationMs}ms
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {s.status}
                </Badge>
              </div>
              {s.message && (
                <p className="mt-2 text-xs text-muted-foreground">{String(s.message)}</p>
              )}
              {s.nodeType.startsWith("send_") && typeof s.output?.url === "string" ? (
                <MediaPreview
                  kind={s.nodeType.replace("send_", "") as MediaKind}
                  url={s.output.url}
                  filename={typeof s.output.filename === "string" ? s.output.filename : null}
                  caption={typeof s.output.caption === "string" ? s.output.caption : null}
                />
              ) : null}
              {s.output && Object.keys(s.output).length > 0 && (
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
                  {JSON.stringify(s.output, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  );
}

function MediaPreview({
  kind,
  url,
  filename,
  caption,
}: {
  kind: MediaKind;
  url: string;
  filename: string | null;
  caption: string | null;
}) {
  return (
    <div className="mt-2 rounded-md border border-border/60 bg-background/60 p-2">
      {kind === "image" && (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={url} className="mx-auto max-h-32 rounded object-contain" alt="preview" />
      )}
      {kind === "audio" && (
        <audio controls src={url} className="w-full">
          <track kind="captions" />
        </audio>
      )}
      {kind === "video" && (
        <video controls src={url} className="max-h-32 w-full rounded">
          <track kind="captions" />
        </video>
      )}
      {kind === "document" && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-xs"
        >
          <FileText className="h-4 w-4" />
          <span className="truncate">{filename ?? "arquivo"}</span>
        </a>
      )}
      {caption && <p className="mt-1 text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
