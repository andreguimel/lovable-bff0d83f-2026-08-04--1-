import { Trash2, Copy, GripVertical, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaPicker, type MediaKind } from "@/components/flows/media-picker";
import { BLOCKS, type NodeKind } from "./blocks";
import type { FlowNodeData } from "./custom-node";

interface Props {
  nodeId: string;
  kind: NodeKind;
  data: FlowNodeData;
  agents: { id: string; name: string; is_active: boolean }[];
  flowId: string;
  onChange: (patch: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function PropertiesPanel({
  nodeId,
  kind,
  data,
  agents,
  flowId,
  onChange,
  onDelete,
  onDuplicate,
}: Props) {
  const meta = BLOCKS[kind];
  const Icon = meta.icon;
  const mediaKind: MediaKind | null =
    kind === "send_image"
      ? "image"
      : kind === "send_audio"
        ? "audio"
        : kind === "send_video"
          ? "video"
          : kind === "send_document"
            ? "document"
            : null;

  return (
    <aside className="properties-panel">
      <header className="properties-panel__head">
        <span
          className="properties-panel__icon"
          style={{ ["--card-accent" as string]: meta.accent }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {meta.label}
          </p>
          <p className="truncate text-[10px] text-muted-foreground/70">
            ID: <code className="text-[10px]">{nodeId.slice(0, 8)}</code>
          </p>
        </div>
        {kind !== "start" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onDuplicate}
              title="Duplicar"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </header>

      <div className="properties-panel__body">
        <div className="grid gap-1.5">
          <Label htmlFor="label" className="text-[11px] text-muted-foreground">
            Rótulo
          </Label>
          <Input
            id="label"
            value={typeof data.label === "string" ? data.label : ""}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={meta.label}
            className="h-8"
          />
        </div>

        {(kind === "message" || kind === "question") && (
          <div className="grid gap-1.5">
            <Label htmlFor="body" className="text-[11px] text-muted-foreground">
              Conteúdo
            </Label>
            <Textarea
              id="body"
              rows={5}
              value={typeof data.body === "string" ? data.body : ""}
              onChange={(e) => onChange({ body: e.target.value })}
              placeholder="Digite a mensagem enviada ao contato…"
              className="resize-none text-sm"
            />
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3" /> variáveis: {"{{contact.name}}"}, {"{{ai.output}}"}
            </p>
          </div>
        )}

        {kind === "wait" && (
          <div className="grid gap-1.5">
            <Label htmlFor="seconds" className="text-[11px] text-muted-foreground">
              Aguardar (segundos)
            </Label>
            <Input
              id="seconds"
              type="number"
              min={1}
              value={typeof data.seconds === "number" ? data.seconds : ""}
              onChange={(e) => onChange({ seconds: Number(e.target.value) || 0 })}
              className="h-8"
            />
          </div>
        )}

        {kind === "condition" && (
          <div className="grid gap-1.5">
            <Label htmlFor="expression" className="text-[11px] text-muted-foreground">
              Expressão
            </Label>
            <Input
              id="expression"
              value={typeof data.expression === "string" ? data.expression : ""}
              onChange={(e) => onChange({ expression: e.target.value })}
              placeholder="ex: contact.tags contains 'VIP'"
              className="h-8 font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Saída <b>sim</b> quando verdadeira, <b>não</b> caso contrário.
            </p>
          </div>
        )}

        {kind === "ai" && (
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Agente de IA</Label>
            <Select
              value={typeof data.agent_id === "string" ? data.agent_id : ""}
              onValueChange={(v) => onChange({ agent_id: v })}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Selecione um agente…" />
              </SelectTrigger>
              <SelectContent>
                {agents.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nenhum agente. Crie um em Agentes IA.
                  </div>
                ) : (
                  agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} {a.is_active ? "" : "(inativo)"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {kind === "assign_agent" && (
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Agente responsável</Label>
            <Select
              value={typeof data.agent_id === "string" ? data.agent_id : ""}
              onValueChange={(v) => onChange({ agent_id: v })}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {kind === "tag" && (
          <div className="grid gap-1.5">
            <Label htmlFor="tag" className="text-[11px] text-muted-foreground">
              Tag
            </Label>
            <Input
              id="tag"
              value={typeof data.tag === "string" ? data.tag : ""}
              onChange={(e) => onChange({ tag: e.target.value })}
              placeholder="Ex: VIP, quente, retorno"
              className="h-8"
            />
          </div>
        )}

        {kind === "http_request" && (
          <>
            <div className="grid gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Método</Label>
              <Select
                value={typeof data.method === "string" ? data.method : "GET"}
                onValueChange={(v) => onChange({ method: v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="url-http" className="text-[11px] text-muted-foreground">
                URL
              </Label>
              <Input
                id="url-http"
                value={typeof data.url === "string" ? data.url : ""}
                onChange={(e) => onChange({ url: e.target.value })}
                placeholder="https://api.exemplo.com/endpoint"
                className="h-8 font-mono text-xs"
              />
            </div>
          </>
        )}

        {kind === "webhook" && (
          <div className="grid gap-1.5">
            <Label htmlFor="url" className="text-[11px] text-muted-foreground">
              URL do webhook
            </Label>
            <Input
              id="url"
              value={typeof data.url === "string" ? data.url : ""}
              onChange={(e) => onChange({ url: e.target.value })}
              placeholder="https://…"
              className="h-8 font-mono text-xs"
            />
          </div>
        )}

        {kind === "wait_reply" && (
          <p className="rounded-md border border-border/60 bg-muted/40 p-2 text-[11px] text-muted-foreground">
            O fluxo pausa aqui até o contato responder. A próxima mensagem retoma a execução.
          </p>
        )}

        {mediaKind && (
          <div className="grid gap-2">
            <MediaPicker
              kind={mediaKind}
              flowId={flowId}
              value={{
                url: typeof data.media_url === "string" ? data.media_url : undefined,
                filename:
                  typeof data.media_filename === "string" ? data.media_filename : undefined,
                mime_type: typeof data.media_mime === "string" ? data.media_mime : undefined,
                size: typeof data.media_size === "number" ? data.media_size : undefined,
              }}
              onChange={(v) =>
                onChange({
                  media_url: v.url,
                  media_filename: v.filename,
                  media_mime: v.mime_type,
                  media_size: v.size,
                })
              }
            />
            {(mediaKind === "image" || mediaKind === "video" || mediaKind === "document") && (
              <div className="grid gap-1.5">
                <Label htmlFor="caption" className="text-[11px] text-muted-foreground">
                  Legenda (opcional)
                </Label>
                <Textarea
                  id="caption"
                  rows={2}
                  value={typeof data.caption === "string" ? data.caption : ""}
                  onChange={(e) => onChange({ caption: e.target.value })}
                  placeholder="Texto que acompanha a mídia."
                  className="resize-none text-sm"
                />
              </div>
            )}
            {mediaKind === "audio" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">Mensagem de voz (PTT)</p>
                    <p className="text-[10px] text-muted-foreground">
                      Envia como áudio de WhatsApp (voice=true).
                    </p>
                  </div>
                  <Switch
                    checked={!!data.is_voice}
                    onCheckedChange={(v) => onChange({ is_voice: v })}
                  />
                </div>
                {!!data.is_voice &&
                  typeof data.media_mime === "string" &&
                  data.media_mime &&
                  !/ogg|opus/i.test(data.media_mime) && (
                    <p className="flex items-start gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        Para PTT ideal, use áudio OGG/Opus. Arquivos {data.media_mime} podem
                        ser entregues como áudio comum em alguns dispositivos.
                      </span>
                    </p>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="properties-panel__foot">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <GripVertical className="h-3 w-3" /> Alterações salvas automaticamente no próximo Salvar.
        </p>
      </footer>
    </aside>
  );
}
