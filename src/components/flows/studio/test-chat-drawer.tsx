/**
 * FB-14 / ZENDA WHATSAPP REAL SIMULATOR V2
 *
 * Simulador visual do fluxo, agora com aparência e comportamento próximos
 * ao WhatsApp real. Interpreta o grafo direto da store do Flow Builder
 * espelhando 1:1 os `NODE_PLUGINS` do runtime servidor (mesma semântica
 * de handles/kinds), mas sem tocar em banco/provedor.
 *
 * Suporta TODOS os `CANONICAL_BLOCK_KINDS` + aliases legados. Nunca
 * retorna "Bloco não suportado".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Camera,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  MapPin,
  MoreVertical,
  Paperclip,
  Phone,
  Play,
  Plus,
  RotateCcw,
  Send,
  Smile,
  User,
  Video as VideoIcon,
  Mic,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useBuilderStore } from "@/features/flow-builder/state/store";
import type { BuilderEdge, BuilderNode } from "@/features/flow-builder/state/types";

// ------------------------------------------------------------------
// Tipos das bolhas de conversa
// ------------------------------------------------------------------
type Tick = "sending" | "sent" | "delivered" | "read";

type ChatBase = {
  id: string;
  ts: string; // hh:mm
  from: "bot" | "user";
  tick?: Tick;
};

type BubbleText = ChatBase & { kind: "text"; text: string };
type BubbleImage = ChatBase & { kind: "image"; url: string; caption?: string };
type BubbleVideo = ChatBase & { kind: "video"; url: string; caption?: string };
type BubbleAudio = ChatBase & { kind: "audio"; url: string; seconds?: number };
type BubbleDoc = ChatBase & {
  kind: "document";
  url: string;
  filename: string;
  mime?: string;
  sizeLabel?: string;
};
type BubbleLocation = ChatBase & {
  kind: "location";
  lat: number;
  lng: number;
  label?: string;
};
type BubbleContact = ChatBase & {
  kind: "contact";
  name: string;
  phone?: string;
};
type BubbleButtons = ChatBase & {
  kind: "buttons";
  text: string;
  options: { label: string; edgeId: string; targetId: string | null }[];
  answered?: string;
  itemToken: string;
};
type BubbleList = ChatBase & {
  kind: "list";
  text: string;
  options: { label: string; edgeId: string; targetId: string | null }[];
  answered?: string;
  itemToken: string;
};
type BubbleTemplate = ChatBase & {
  kind: "template";
  name: string;
  body: string;
};

type SystemItem = {
  id: string;
  from: "system";
  kind: "system";
  text: string;
  tone?: "info" | "warn" | "end" | "transfer";
  icon?: "transfer" | "info" | "end";
};

type ChatItem =
  | BubbleText
  | BubbleImage
  | BubbleVideo
  | BubbleAudio
  | BubbleDoc
  | BubbleLocation
  | BubbleContact
  | BubbleButtons
  | BubbleList
  | BubbleTemplate
  | SystemItem;

type WaitingKind =
  | "text"
  | "buttons"
  | "list"
  | "condition"
  | null;

interface WaitingState {
  kind: WaitingKind;
  nodeId: string | null;
  options?: { label: string; edgeId: string; targetId: string | null }[];
  itemToken?: string;
}

// Distributes Omit over union so discriminated members keep their own props
type DistOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
type AppendInput = DistOmit<ChatItem, "id" | "ts"> & { ts?: string };
type BotBubbleInput = DistOmit<
  Exclude<ChatItem, SystemItem>,
  "id" | "ts" | "from" | "tick"
>;

interface Props {
  open: boolean;
  onClose: () => void;
}

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
function nowHHMM(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickText(data: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = data?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function pickNum(data: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = data?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function humanize(kind: string): string {
  return kind.replace(/_/g, " ");
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase() : "FILE";
}

// ------------------------------------------------------------------
// Sub-componentes visuais
// ------------------------------------------------------------------
function TickIcon({ tick }: { tick?: Tick }) {
  if (!tick) return null;
  if (tick === "sending") {
    return (
      <svg viewBox="0 0 16 16" className="h-3 w-3 opacity-70" fill="currentColor">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 4v4l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  const color = tick === "read" ? "text-sky-500" : "text-muted-foreground/80";
  return <CheckCheck className={`h-3.5 w-3.5 ${color}`} />;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border/60 bg-card px-3 py-2 shadow-sm">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </div>
  );
}

function AudioBubble({ url, seconds }: { url: string; seconds?: number }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [dur, setDur] = useState<number | null>(seconds ?? null);
  const [cur, setCur] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const total = dur && dur > 0 ? dur : 1;
  const pct = Math.min(100, (cur / total) * 100);

  // waveform estático (barras) — apenas visual
  const bars = useMemo(
    () => Array.from({ length: 28 }, (_, i) => 6 + ((i * 7) % 14)),
    [],
  );

  return (
    <div className="flex items-center gap-3 py-1">
      <button
        type="button"
        onClick={toggle}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:brightness-110"
        aria-label={playing ? "Pausar" : "Reproduzir"}
      >
        {playing ? (
          <span className="block h-3 w-3 border-l-2 border-r-2 border-current" />
        ) : (
          <Play className="h-4 w-4 translate-x-0.5 fill-current" />
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex h-6 items-center gap-[2px]">
          {bars.map((h, i) => {
            const active = (i / bars.length) * 100 <= pct;
            return (
              <span
                key={i}
                className={`w-[2px] rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {Math.floor(cur / 60)}:{String(Math.floor(cur % 60)).padStart(2, "0")}
          </span>
          <span>
            {dur ? `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, "0")}` : "--:--"}
          </span>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setCur(0);
        }}
        preload="metadata"
      />
    </div>
  );
}

function DocumentBubble({ url, filename, sizeLabel }: { url: string; filename: string; sizeLabel?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-2 transition hover:bg-background"
    >
      <div className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{filename}</div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {extOf(filename)}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </div>
      </div>
    </a>
  );
}

function LocationBubble({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  // "mapa estático" sem depender de provedor externo — placeholder estilizado
  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <div
        className="relative h-32 w-56 bg-[linear-gradient(135deg,#dbeafe,#bbf7d0)] dark:bg-[linear-gradient(135deg,#0b2740,#052e1a)]"
        aria-hidden
      >
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(0,0,0,.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,.12)_1px,transparent_1px)] [background-size:20px_20px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <MapPin className="h-8 w-8 fill-red-500 text-red-600 drop-shadow" />
        </div>
      </div>
      <div className="px-3 py-2 text-xs">
        <div className="font-medium">{label || "Localização"}</div>
        <div className="text-muted-foreground">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      </div>
    </div>
  );
}

function ContactBubble({ name, phone }: { name: string; phone?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <User className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        {phone && <div className="truncate text-xs text-muted-foreground">{phone}</div>}
      </div>
      <Phone className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// ------------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------------
export function TestChatDrawer({ open, onClose }: Props) {
  const nodesById = useBuilderStore((s) => s.nodesById);
  const edgesById = useBuilderStore((s) => s.edgesById);
  const nodeOrder = useBuilderStore((s) => s.nodeOrder);
  const edgeOrder = useBuilderStore((s) => s.edgeOrder);

  const [items, setItems] = useState<ChatItem[]>([]);
  const [waiting, setWaiting] = useState<WaitingState>({ kind: null, nodeId: null });
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "typing" | "waiting" | "ended" | "error">("idle");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const runIdRef = useRef(0);
  const [attachOpen, setAttachOpen] = useState(false);

  // ---- helpers de grafo (espelham `NODE_PLUGINS.next` do runtime)
  const outgoingOf = useCallback(
    (nodeId: string): BuilderEdge[] =>
      edgeOrder
        .map((id) => edgesById[id])
        .filter((e): e is BuilderEdge => !!e && e.source === nodeId),
    [edgesById, edgeOrder],
  );

  const findStart = useCallback((): BuilderNode | null => {
    for (const id of nodeOrder) {
      const n = nodesById[id];
      if (n?.kind === "start") return n;
    }
    return null;
  }, [nodeOrder, nodesById]);

  const nextFromHandle = useCallback(
    (nodeId: string, handle: string | null): string | null => {
      const outs = outgoingOf(nodeId);
      if (handle != null) {
        const match = outs.find((e) => (e.sourceHandle ?? null) === handle);
        if (match) return match.target;
      }
      const def = outs.find(
        (e) => !e.sourceHandle || e.sourceHandle === "default" || e.sourceHandle === "next",
      );
      if (def) return def.target;
      return outs[0]?.target ?? null;
    },
    [outgoingOf],
  );

  const append = useCallback((it: AppendInput): string => {
    const id = newId();
    const ts = it.ts ?? nowHHMM();
    setItems((prev) => [...prev, { ...(it as unknown as ChatItem), id, ts }]);
    return id;
  }, []);

  const upgradeTicks = useCallback((id: string) => {
    setTimeout(() => {
      setItems((prev) =>
        prev.map((it) => (it.id === id && "tick" in it ? { ...it, tick: "delivered" as Tick } : it)),
      );
    }, 250);
    setTimeout(() => {
      setItems((prev) =>
        prev.map((it) => (it.id === id && "tick" in it ? { ...it, tick: "read" as Tick } : it)),
      );
    }, 900);
  }, []);

  const sendFromBot = useCallback(
    (it: BotBubbleInput) => {
      const id = append({ ...(it as unknown as AppendInput), from: "bot", tick: "delivered" } as AppendInput);
      return id;
    },
    [append],
  );


  // ---- interpretador (espelho dos `NODE_PLUGINS` server-side)
  const runFrom = useCallback(
    async (startNodeId: string, myRunId: number) => {
      let current: string | null = startNodeId;
      let safety = 0;
      while (current && safety++ < 300) {
        if (runIdRef.current !== myRunId) return;
        const node: BuilderNode | undefined = nodesById[current];
        if (!node) break;
        const data = (node.data ?? {}) as Record<string, unknown>;

        // "digitando..." antes de cada emissão do bot
        const emits =
          node.kind === "message" ||
          node.kind === "send_message" ||
          node.kind === "question" ||
          node.kind === "menu" ||
          node.kind === "send_image" ||
          node.kind === "send_audio" ||
          node.kind === "send_video" ||
          node.kind === "send_document" ||
          node.kind === "ai" ||
          node.kind === "run_agent" ||
          node.kind === "template";
        if (emits) {
          setStatus("typing");
          await new Promise((r) => setTimeout(r, 480));
          if (runIdRef.current !== myRunId) return;
        }

        switch (node.kind) {
          case "start": {
            current = nextFromHandle(node.id, null);
            break;
          }
          case "end": {
            append({
              kind: "system",
              from: "system",
              text: "Conversa encerrada",
              tone: "end",
              icon: "end",
            });
            setStatus("ended");
            return;
          }
          case "message":
          case "send_message":
          case "container_content": {
            const rawItems = (data.items as Array<Record<string, unknown>>) || [];
            if (rawItems.length > 0) {
              let pausedForAnswer = false;
              for (const sub of rawItems) {
                const subType = sub.type as string;
                if (subType === "text") {
                  const content = (sub.content as string) || (sub.text as string) || "";
                  if (content) {
                    const id = sendFromBot({ kind: "text", text: content });
                    upgradeTicks(id);
                  }
                } else if (subType === "image") {
                  const url = (sub.url as string) || "https://images.unsplash.com/photo-1579546929518-9e396f3cc809";
                  const id = sendFromBot({ kind: "image", url, caption: "Imagem enviada" });
                  upgradeTicks(id);
                } else if (subType === "video") {
                  const url = (sub.url as string) || "https://www.w3schools.com/html/mov_bbb.mp4";
                  const id = sendFromBot({ kind: "video", url, caption: "Vídeo enviado" });
                  upgradeTicks(id);
                } else if (subType === "audio") {
                  const url = (sub.url as string) || "https://www.w3schools.com/html/horse.mp3";
                  const id = sendFromBot({ kind: "audio", url, seconds: 5 });
                  upgradeTicks(id);
                } else if (subType === "document") {
                  const url = (sub.url as string) || "#";
                  const filename = (sub.fileName as string) || "documento.pdf";
                  const id = sendFromBot({ kind: "document", url, filename });
                  upgradeTicks(id);
                } else if (subType === "contact") {
                  const name = (sub.name as string) || "Contato";
                  const phone = (sub.phone as string) || "+5511999999999";
                  const id = sendFromBot({ kind: "contact", name, phone });
                  upgradeTicks(id);
                } else if (subType === "delay") {
                  const secs = Number(sub.seconds || 5);
                  setStatus("typing");
                  await new Promise((r) => setTimeout(r, Math.min(secs, 4) * 400));
                } else if (subType === "auto_off") {
                  append({
                    kind: "system",
                    from: "system",
                    text: "Auto-Off ativado (resposta padrão desligada)",
                    tone: "info",
                  });
                } else if (subType === "save_response") {
                  const q = (sub.question as string) || "Insira sua pergunta aqui";
                  const id = sendFromBot({ kind: "text", text: q });
                  upgradeTicks(id);
                  setWaiting({ kind: "text", nodeId: node.id, itemToken: String(sub.id || "") });
                  setStatus("waiting");
                  pausedForAnswer = true;
                  break;
                }
              }
              if (pausedForAnswer) return;
            } else {
              const txt = pickText(data, "body", "text", "message", "label");
              if (txt) {
                const id = sendFromBot({ kind: "text", text: txt });
                upgradeTicks(id);
              }
            }
            current = nextFromHandle(node.id, null);
            break;
          }
          case "question": {
            const txt = pickText(data, "body", "text", "message", "question", "label");
            const id = sendFromBot({ kind: "text", text: txt || "(pergunta vazia)" });
            upgradeTicks(id);
            setWaiting({ kind: "text", nodeId: node.id });
            setStatus("waiting");
            return;
          }
          case "send_image": {
            const url = pickText(data, "media_url", "url");
            const caption = pickText(data, "caption", "body", "text");
            if (url) {
              const id = sendFromBot({ kind: "image", url, caption: caption || undefined });
              upgradeTicks(id);
            } else {
              const id = sendFromBot({ kind: "text", text: caption || "(imagem sem URL)" });
              upgradeTicks(id);
            }
            current = nextFromHandle(node.id, null);
            break;
          }
          case "send_video": {
            const url = pickText(data, "media_url", "url");
            const caption = pickText(data, "caption", "body", "text");
            if (url) {
              const id = sendFromBot({ kind: "video", url, caption: caption || undefined });
              upgradeTicks(id);
            } else {
              const id = sendFromBot({ kind: "text", text: caption || "(vídeo sem URL)" });
              upgradeTicks(id);
            }
            current = nextFromHandle(node.id, null);
            break;
          }
          case "send_audio": {
            const url = pickText(data, "media_url", "url");
            const dur = pickNum(data, "duration", "seconds");
            if (url) {
              const id = sendFromBot({ kind: "audio", url, seconds: dur ?? undefined });
              upgradeTicks(id);
            } else {
              const id = sendFromBot({ kind: "text", text: "(áudio sem URL)" });
              upgradeTicks(id);
            }
            current = nextFromHandle(node.id, null);
            break;
          }
          case "send_document": {
            const url = pickText(data, "media_url", "url");
            const filename = pickText(data, "media_filename", "filename") || "documento";
            const mime = pickText(data, "media_mime", "mime");
            const id = sendFromBot({
              kind: "document",
              url: url || "#",
              filename,
              mime,
            });
            upgradeTicks(id);
            current = nextFromHandle(node.id, null);
            break;
          }
          case "menu": {
            const title = pickText(data, "body", "text", "message", "question") || "Escolha uma opção:";
            const rawOpts = (data.options ?? data.items ?? []) as unknown;
            const opts = Array.isArray(rawOpts)
              ? rawOpts.map((o, idx) => {
                  const obj = (o ?? {}) as Record<string, unknown>;
                  const label =
                    (typeof obj.label === "string" && obj.label) ||
                    (typeof obj.text === "string" && obj.text) ||
                    `Opção ${idx + 1}`;
                  const handle =
                    (typeof obj.handle === "string" && obj.handle) ||
                    (typeof obj.id === "string" && obj.id) ||
                    String(idx);
                  return { label: String(label), handle: String(handle) };
                })
              : [];
            if (opts.length === 0) {
              const id = sendFromBot({ kind: "text", text: title });
              upgradeTicks(id);
              append({
                kind: "system",
                from: "system",
                text: "Menu sem opções configuradas.",
                tone: "warn",
              });
              setStatus("ended");
              return;
            }
            const outs = outgoingOf(node.id);
            const menuOpts = opts.map((o) => {
              const edge = outs.find((e) => (e.sourceHandle ?? "") === o.handle);
              return { label: o.label, edgeId: edge?.id ?? "", targetId: edge?.target ?? null };
            });
            // Renderiza como lista quando > 3 opções, senão como quick-reply
            const isList = menuOpts.length > 3;
            const token = newId();
            sendFromBot(
              isList
                ? { kind: "list", text: title, options: menuOpts, itemToken: token }
                : { kind: "buttons", text: title, options: menuOpts, itemToken: token },
            );
            setWaiting({
              kind: isList ? "list" : "buttons",
              nodeId: node.id,
              options: menuOpts,
              itemToken: token,
            });
            setStatus("waiting");
            return;
          }
          case "condition": {
            append({
              kind: "system",
              from: "system",
              text: "Condição — escolha um caminho para simular",
              tone: "info",
            });
            const outs = outgoingOf(node.id);
            const trueEdge = outs.find((e) => e.sourceHandle === "true") ?? outs[0];
            const falseEdge = outs.find((e) => e.sourceHandle === "false") ?? outs[1];
            const menuOpts = [
              trueEdge && { label: "Verdadeiro", edgeId: trueEdge.id, targetId: trueEdge.target },
              falseEdge && { label: "Falso", edgeId: falseEdge.id, targetId: falseEdge.target },
            ].filter(Boolean) as { label: string; edgeId: string; targetId: string | null }[];
            if (menuOpts.length === 0) {
              append({ kind: "system", from: "system", text: "Condição sem saídas.", tone: "warn" });
              setStatus("ended");
              return;
            }
            const token = newId();
            sendFromBot({
              kind: "buttons",
              text: "Qual ramo seguir?",
              options: menuOpts,
              itemToken: token,
            });
            setWaiting({ kind: "condition", nodeId: node.id, options: menuOpts, itemToken: token });
            setStatus("waiting");
            return;
          }
          case "randomizer": {
            const outs = outgoingOf(node.id);
            if (outs.length === 0) {
              append({ kind: "system", from: "system", text: "Randomizador sem saídas.", tone: "warn" });
              setStatus("ended");
              return;
            }
            const branches = (data.branches ?? data.options ?? []) as unknown;
            let weights = outs.map(() => 1);
            if (Array.isArray(branches) && branches.length === outs.length) {
              weights = branches.map((b) => {
                const obj = (b ?? {}) as Record<string, unknown>;
                const w = typeof obj.weight === "number" ? obj.weight : 1;
                return Math.max(0, w);
              });
            }
            const total = weights.reduce((a, b) => a + b, 0) || outs.length;
            let r = Math.random() * total;
            let idx = 0;
            for (let i = 0; i < outs.length; i++) {
              r -= weights[i];
              if (r <= 0) {
                idx = i;
                break;
              }
            }
            append({
              kind: "system",
              from: "system",
              text: `Randomizador: caminho ${idx + 1} de ${outs.length}`,
              tone: "info",
            });
            current = outs[idx].target;
            break;
          }
          case "wait": {
            const seconds = Number(data.seconds ?? data.duration ?? 1) || 1;
            setStatus("typing");
            append({
              kind: "system",
              from: "system",
              text: `Aguardando ${seconds}s…`,
              tone: "info",
            });
            await new Promise((r) => setTimeout(r, Math.min(seconds, 4) * 400));
            current = nextFromHandle(node.id, null);
            break;
          }
          case "wait_reply": {
            append({
              kind: "system",
              from: "system",
              text: "Aguardando resposta do contato…",
              tone: "info",
            });
            setWaiting({ kind: "text", nodeId: node.id });
            setStatus("waiting");
            return;
          }
          case "action":
          case "tag":
          case "add_tag":
          case "apply_tag":
          case "assign_agent":
          case "transfer":
          case "transfer_human": {
            const kindLabels: Record<string, string> = {
              action: "Ação",
              tag: "Etiqueta aplicada",
              add_tag: "Etiqueta aplicada",
              apply_tag: "Etiqueta aplicada",
              assign_agent: "Atribuído a agente",
              transfer: "Transferido para humano",
              transfer_human: "Transferido para humano",
            };
            const prefix = kindLabels[node.kind] ?? humanize(node.kind);
            const label = pickText(data, "label", "name", "tag", "agent_name");
            append({
              kind: "system",
              from: "system",
              text: label ? `${prefix}: ${label}` : prefix,
              tone: "info",
            });
            current = nextFromHandle(node.id, null);
            break;
          }
          case "http_request":
          case "webhook": {
            const method = pickText(data, "method") || "GET";
            const url = pickText(data, "url");
            append({
              kind: "system",
              from: "system",
              text: url
                ? `${method} ${url.replace(/^https?:\/\//i, "").split("/")[0]} · 200 OK (simulado)`
                : `${humanize(node.kind)} simulado (200 OK)`,
              tone: "info",
            });
            current = nextFromHandle(node.id, "success") ?? nextFromHandle(node.id, null);
            break;
          }
          case "ai":
          case "run_agent": {
            const agentName = pickText(data, "agent_name", "agent_label", "label") || "Assistente";
            append({
              kind: "system",
              from: "system",
              text: `🤖 ${agentName} está digitando…`,
              tone: "info",
            });
            await new Promise((r) => setTimeout(r, 800));
            const id = sendFromBot({
              kind: "text",
              text: pickText(data, "sample_response") ||
                `Olá! Sou ${agentName}, resposta simulada gerada pela IA. Como posso ajudar?`,
            });
            upgradeTicks(id);
            current = nextFromHandle(node.id, null);
            break;
          }
          case "flow_connection": {
            const name = pickText(data, "flow_name", "flow_label", "label") || "outro fluxo";
            append({
              kind: "system",
              from: "system",
              text: `Transferido para o fluxo: ${name}`,
              tone: "transfer",
              icon: "transfer",
            });
            setStatus("ended");
            return;
          }
          case "transfer_number": {
            const toName = pickText(data, "to_channel_label", "to_channel_name") || "outro canal";
            const fromName = pickText(data, "from_channel_label", "from_channel_name") || "canal atual";
            const modeRaw = pickText(data, "transfer_mode") || "channel_only";
            const modeLabels: Record<string, string> = {
              channel_only: "somente altera o canal",
              channel_message: "canal + mensagem",
              channel_flow: "canal + fluxo",
              channel_agent: "canal + Agente IA",
              channel_message_flow: "canal + mensagem + fluxo",
              channel_message_agent: "canal + mensagem + Agente IA",
            };
            const modeLabel = modeLabels[modeRaw] ?? modeLabels.channel_only;
            append({
              kind: "system",
              from: "system",
              text: `🔄 Atendimento transferido\n${fromName}  →  ${toName}\n(${modeLabel})`,
              tone: "transfer",
              icon: "transfer",
            });

            const wantsMessage =
              modeRaw === "channel_message" ||
              modeRaw === "channel_message_flow" ||
              modeRaw === "channel_message_agent";
            const wantsFlow = modeRaw === "channel_flow" || modeRaw === "channel_message_flow";
            const wantsAgent = modeRaw === "channel_agent" || modeRaw === "channel_message_agent";

            if (wantsMessage) {
              const msg = pickText(data, "initial_message") || "(mensagem inicial vazia)";
              setStatus("typing");
              await new Promise((r) => setTimeout(r, 400));
              const id = sendFromBot({ kind: "text", text: msg });
              upgradeTicks(id);
            }
            if (wantsFlow) {
              const flowName = pickText(data, "flow_label", "flow_name") || "fluxo selecionado";
              append({
                kind: "system",
                from: "system",
                text: `Fluxo iniciado no novo canal: ${flowName}`,
                tone: "info",
              });
            }
            if (wantsAgent) {
              const agentName = pickText(data, "agent_label", "agent_name") || "Agente IA";
              setStatus("typing");
              await new Promise((r) => setTimeout(r, 500));
              const id = sendFromBot({ kind: "text", text: `🤖 ${agentName} assumiu a conversa.` });
              upgradeTicks(id);
            }

            current = nextFromHandle(node.id, "success") ?? nextFromHandle(node.id, null);
            break;
          }
          case "template": {
            const name = pickText(data, "template_name", "name") || "template";
            const body = pickText(data, "body", "text") || "(corpo do template)";
            const id = sendFromBot({ kind: "template", name, body });
            upgradeTicks(id);
            current = nextFromHandle(node.id, null);
            break;
          }
          default: {
            // Fallback genérico — jamais mostra "Bloco não suportado".
            append({
              kind: "system",
              from: "system",
              text: `Bloco executado: ${humanize(node.kind)}`,
              tone: "info",
            });
            current = nextFromHandle(node.id, null);
            break;
          }
        }
      }
      if (safety >= 300) {
        append({
          kind: "system",
          from: "system",
          text: "Limite de execução atingido.",
          tone: "warn",
        });
      }
      setStatus((s) => (s === "waiting" ? s : "ended"));
    },
    [append, nextFromHandle, nodesById, outgoingOf, sendFromBot, upgradeTicks],
  );

  const restart = useCallback(() => {
    runIdRef.current += 1;
    setItems([]);
    setInput("");
    setWaiting({ kind: null, nodeId: null });
    const start = findStart();
    if (!start) {
      append({
        kind: "system",
        from: "system",
        text: "Fluxo sem bloco inicial.",
        tone: "warn",
      });
      setStatus("error");
      return;
    }
    const myId = runIdRef.current;
    void runFrom(start.id, myId);
  }, [append, findStart, runFrom]);

  // reset ao abrir
  useEffect(() => {
    if (open) restart();
    else runIdRef.current += 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, status]);

  // foco ao aguardar texto
  useEffect(() => {
    if (status === "waiting" && waiting.kind === "text") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [status, waiting.kind]);

  const handleSendText = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (status !== "waiting" || waiting.kind !== "text") return;
    const id = append({ kind: "text", from: "user", text, tick: "sending" });
    upgradeTicks(id);
    setInput("");
    const nodeId = waiting.nodeId!;
    setWaiting({ kind: null, nodeId: null });
    const next = nextFromHandle(nodeId, null);
    if (next) {
      const myId = runIdRef.current;
      void runFrom(next, myId);
    } else {
      setStatus("ended");
    }
  }, [append, input, nextFromHandle, runFrom, status, upgradeTicks, waiting]);

  const handlePickOption = useCallback(
    (token: string, optIdx: number) => {
      if (
        status !== "waiting" ||
        (waiting.kind !== "buttons" && waiting.kind !== "list" && waiting.kind !== "condition") ||
        waiting.itemToken !== token
      ) {
        return;
      }
      const opt = waiting.options?.[optIdx];
      if (!opt) return;
      const uid = append({ kind: "text", from: "user", text: opt.label, tick: "sending" });
      upgradeTicks(uid);
      setItems((prev) =>
        prev.map((it) =>
          (it.kind === "buttons" || it.kind === "list") && it.itemToken === token
            ? { ...it, answered: opt.label }
            : it,
        ),
      );
      const target = opt.targetId;
      setWaiting({ kind: null, nodeId: null });
      if (target) {
        const myId = runIdRef.current;
        void runFrom(target, myId);
      } else {
        append({
          kind: "system",
          from: "system",
          text: "Saída sem destino conectado.",
          tone: "warn",
        });
        setStatus("ended");
      }
    },
    [append, runFrom, status, upgradeTicks, waiting],
  );

  const userSendQuick = useCallback(
    (kind: "image" | "video" | "document" | "audio" | "location") => {
      setAttachOpen(false);
      const samples = {
        image: {
          kind: "image" as const,
          url: "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=600",
        },
        video: {
          kind: "video" as const,
          url: "",
          caption: "video-teste.mp4",
        },
        document: {
          kind: "document" as const,
          url: "#",
          filename: "documento-teste.pdf",
          sizeLabel: "128 KB",
        },
        audio: { kind: "audio" as const, url: "", seconds: 6 },
        location: {
          kind: "location" as const,
          lat: -23.55052,
          lng: -46.633308,
          label: "São Paulo, SP",
        },
      };
      const payload = samples[kind];
      const id = append({ ...(payload as unknown as AppendInput), from: "user", tick: "sending" } as AppendInput);
      upgradeTicks(id);
      // se o bot estiver aguardando resposta de texto, considera enviado
      if (status === "waiting" && waiting.kind === "text" && waiting.nodeId) {
        const nodeId = waiting.nodeId;
        setWaiting({ kind: null, nodeId: null });
        const next = nextFromHandle(nodeId, null);
        if (next) {
          const myId = runIdRef.current;
          void runFrom(next, myId);
        }
      }
    },
    [append, nextFromHandle, runFrom, status, upgradeTicks, waiting],
  );

  const statusLabel = useMemo(() => {
    switch (status) {
      case "typing":
        return "digitando…";
      case "waiting":
        return "online";
      case "ended":
        return "conversa encerrada";
      case "error":
        return "erro";
      default:
        return "online";
    }
  }, [status]);

  // -------------------- Render --------------------
  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          {/* Header — estilo WhatsApp */}
          <SheetHeader className="border-b bg-[#075e54] px-3 py-2 text-white dark:bg-[#0b3d38]">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-white hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-sm font-medium text-white">
                  Cliente de Teste
                </SheetTitle>
                <SheetDescription className="text-[11px] text-white/80">
                  {statusLabel}
                </SheetDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={restart}
                className="h-8 w-8 text-white hover:bg-white/10"
                aria-label="Reiniciar"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <MoreVertical className="h-4 w-4 text-white/80" />
            </div>
          </SheetHeader>

          {/* Chat area — wallpaper WhatsApp-like */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3"
            style={{
              backgroundColor: "#ece5dd",
              backgroundImage:
                "radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)",
              backgroundSize: "18px 18px, 26px 26px",
              backgroundPosition: "0 0, 9px 13px",
            }}
          >
            {items.map((it) => {
              if (it.kind === "system") {
                const tone =
                  it.tone === "warn"
                    ? "bg-amber-100 text-amber-900 border-amber-300"
                    : it.tone === "end"
                      ? "bg-slate-200 text-slate-800 border-slate-300"
                      : it.tone === "transfer"
                        ? "bg-sky-100 text-sky-900 border-sky-300"
                        : "bg-white/85 text-slate-700 border-white";
                return (
                  <div key={it.id} className="my-2 flex justify-center">
                    <div
                      className={`flex max-w-[85%] items-start gap-2 whitespace-pre-line rounded-lg border px-3 py-1.5 text-center text-[11px] shadow-sm ${tone}`}
                    >
                      {it.icon === "transfer" && <ArrowLeftRight className="mt-[1px] h-3 w-3 shrink-0" />}
                      <span>{it.text}</span>
                    </div>
                  </div>
                );
              }

              const isUser = it.from === "user";
              const bubbleColor = isUser
                ? "bg-[#dcf8c6] text-slate-900"
                : "bg-white text-slate-900";
              const align = isUser ? "justify-end" : "justify-start";
              const tail = isUser ? "rounded-br-sm" : "rounded-bl-sm";

              return (
                <div key={it.id} className={`flex ${align}`}>
                  <div
                    className={`relative max-w-[82%] rounded-2xl ${tail} ${bubbleColor} px-2 pb-1 pt-1 shadow-sm`}
                  >
                    {/* corpo */}
                    <div className="px-1">
                      {it.kind === "text" && (
                        <div className="whitespace-pre-wrap px-1 pt-0.5 text-[14px] leading-snug">
                          {it.text}
                        </div>
                      )}

                      {it.kind === "image" && (
                        <div className="space-y-1">
                          <button
                            type="button"
                            className="block overflow-hidden rounded-lg"
                            onClick={() => setImagePreview(it.url)}
                          >
                            <img
                              src={it.url}
                              alt={it.caption || "imagem"}
                              className="max-h-64 w-full max-w-[260px] object-cover"
                            />
                          </button>
                          {it.caption && (
                            <div className="px-1 text-[13px] leading-snug">{it.caption}</div>
                          )}
                        </div>
                      )}

                      {it.kind === "video" && (
                        <div className="space-y-1">
                          {it.url ? (
                            <video
                              src={it.url}
                              controls
                              className="max-h-64 w-full max-w-[260px] rounded-lg bg-black"
                            />
                          ) : (
                            <div className="relative flex h-40 w-56 items-center justify-center overflow-hidden rounded-lg bg-slate-900">
                              <VideoIcon className="h-8 w-8 text-white/70" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900">
                                  <Play className="h-5 w-5 translate-x-0.5 fill-current" />
                                </div>
                              </div>
                            </div>
                          )}
                          {it.caption && (
                            <div className="px-1 text-[13px] leading-snug">{it.caption}</div>
                          )}
                        </div>
                      )}

                      {it.kind === "audio" && (
                        <div className="min-w-[240px] px-1">
                          <AudioBubble url={it.url} seconds={it.seconds} />
                        </div>
                      )}

                      {it.kind === "document" && (
                        <div className="min-w-[240px] px-1 py-1">
                          <DocumentBubble url={it.url} filename={it.filename} sizeLabel={it.sizeLabel} />
                        </div>
                      )}

                      {it.kind === "location" && (
                        <div className="px-1 py-1">
                          <LocationBubble lat={it.lat} lng={it.lng} label={it.label} />
                        </div>
                      )}

                      {it.kind === "contact" && (
                        <div className="min-w-[240px] px-1 py-1">
                          <ContactBubble name={it.name} phone={it.phone} />
                        </div>
                      )}

                      {it.kind === "template" && (
                        <div className="space-y-1 px-1 pt-0.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Template · {it.name}
                          </div>
                          <div className="whitespace-pre-wrap text-[14px] leading-snug">
                            {it.body}
                          </div>
                        </div>
                      )}

                      {(it.kind === "buttons" || it.kind === "list") && (
                        <div className="space-y-2 px-1 pt-0.5">
                          <div className="whitespace-pre-wrap text-[14px] leading-snug">
                            {it.text}
                          </div>
                          {it.kind === "buttons" ? (
                            <div className="mt-1 flex flex-col divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                              {it.options.map((opt, idx) => {
                                const picked = it.answered === opt.label;
                                const disabled = !!it.answered;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => handlePickOption(it.itemToken, idx)}
                                    className={`px-3 py-2 text-center text-[13px] font-medium transition ${
                                      picked
                                        ? "bg-emerald-50 text-emerald-700"
                                        : disabled
                                          ? "cursor-not-allowed text-slate-400"
                                          : "text-sky-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <div className="flex items-center justify-between px-3 py-2 text-[12px] font-medium text-sky-600">
                                <span>Ver opções</span>
                                <span>{it.options.length}</span>
                              </div>
                              <div className="divide-y divide-slate-200">
                                {it.options.map((opt, idx) => {
                                  const picked = it.answered === opt.label;
                                  const disabled = !!it.answered;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => handlePickOption(it.itemToken, idx)}
                                      className={`w-full px-3 py-2 text-left text-[13px] transition ${
                                        picked
                                          ? "bg-emerald-50 text-emerald-700"
                                          : disabled
                                            ? "cursor-not-allowed text-slate-400"
                                            : "text-slate-800 hover:bg-slate-50"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* rodapé com hora + ticks */}
                    <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10px] text-slate-500">
                      <span>{it.ts}</span>
                      {isUser && <TickIcon tick={it.tick} />}
                    </div>
                  </div>
                </div>
              );
            })}

            {status === "typing" && (
              <div className="flex justify-start">
                <TypingDots />
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t bg-[#f0f0f0] p-2 dark:bg-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendText();
              }}
              className="flex items-center gap-2"
            >
              <div className="flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-sm">
                <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                      aria-label="Anexar"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    className="w-56 p-1"
                  >
                    <div className="grid grid-cols-1 gap-0.5">
                      <button
                        type="button"
                        onClick={() => userSendQuick("image")}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      >
                        <ImageIcon className="h-4 w-4 text-fuchsia-500" /> Imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => userSendQuick("video")}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      >
                        <VideoIcon className="h-4 w-4 text-red-500" /> Vídeo
                      </button>
                      <button
                        type="button"
                        onClick={() => userSendQuick("document")}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      >
                        <FileText className="h-4 w-4 text-sky-500" /> Documento
                      </button>
                      <button
                        type="button"
                        onClick={() => userSendQuick("audio")}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      >
                        <Mic className="h-4 w-4 text-emerald-500" /> Áudio
                      </button>
                      <button
                        type="button"
                        onClick={() => userSendQuick("location")}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      >
                        <MapPin className="h-4 w-4 text-orange-500" /> Localização
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Smile className="h-5 w-5 shrink-0 text-slate-400" />
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    status === "waiting" && waiting.kind === "text"
                      ? "Mensagem"
                      : status === "waiting" && (waiting.kind === "buttons" || waiting.kind === "list" || waiting.kind === "condition")
                        ? "Toque em uma opção acima"
                        : status === "ended"
                          ? "Conversa encerrada — reinicie para testar"
                          : "Aguarde…"
                  }
                  disabled={status !== "waiting" || waiting.kind !== "text"}
                  className="h-8 border-0 bg-transparent text-[14px] shadow-none focus-visible:ring-0"
                />
                <Camera className="h-5 w-5 shrink-0 text-slate-400" />
                <Paperclip className="h-5 w-5 shrink-0 text-slate-400" />
              </div>
              <Button
                type={input.trim() ? "submit" : "button"}
                onClick={() => {
                  if (!input.trim()) userSendQuick("audio");
                }}
                disabled={status !== "waiting" || waiting.kind !== "text" ? !input.trim() : false}
                className="h-10 w-10 rounded-full bg-[#075e54] p-0 text-white hover:bg-[#0b6b60]"
                aria-label={input.trim() ? "Enviar" : "Gravar áudio"}
              >
                {input.trim() ? <Send className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview de imagem em tela cheia */}
      <Dialog open={!!imagePreview} onOpenChange={(o) => !o && setImagePreview(null)}>
        <DialogContent className="max-w-3xl border-0 bg-black/95 p-2">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="preview"
              className="mx-auto max-h-[80vh] w-auto object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
