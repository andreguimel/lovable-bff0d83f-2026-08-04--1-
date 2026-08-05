import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  Check,
  CircleAlert,
  Loader2,
  Play,
  Redo2,
  Save,
  Settings2,
  TestTube2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TriggerType =
  | "manual"
  | "inbound_message"
  | "keyword"
  | "transfer"
  | "new_contact";

interface Props {
  name: string;
  description: string | null;
  status: string;
  dirty: boolean;
  saving: boolean;
  testing: boolean;
  publishing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  channels: { id: string; name: string }[];
  saveState?: "idle" | "saving" | "saved" | "error";
  saveError?: string | null;
  hasUnpublishedChanges?: boolean;

  onRename: (v: string) => void;
  onDescribe: (v: string | null) => void;
  onSave: () => void;
  onTest: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenAnalytics: () => void;
  onSaveTrigger: (t: TriggerType, cfg: Record<string, unknown>) => void;
}

export function StudioTopbar(p: Props) {
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const currentName = nameDraft ?? p.name;
  const currentDesc = descDraft ?? p.description ?? "";

  return (
    <div className="topbar-studio">
      <div className="topbar-studio__left">
        <Link to="/flows" className="text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="topbar-studio__titles">
          <Input
            value={currentName}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft !== null && nameDraft.trim() && nameDraft !== p.name) {
                p.onRename(nameDraft.trim());
              }
              setNameDraft(null);
            }}
            className="h-6 border-transparent bg-transparent px-1 font-display text-sm font-semibold shadow-none focus-visible:border-border focus-visible:bg-background"
            placeholder="Nome do fluxo"
          />
          <Input
            value={currentDesc}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              if (descDraft !== null && descDraft !== (p.description ?? "")) {
                p.onDescribe(descDraft || null);
              }
              setDescDraft(null);
            }}
            className="h-5 border-transparent bg-transparent px-1 text-[11px] text-muted-foreground shadow-none focus-visible:border-border focus-visible:bg-background"
            placeholder="Descrição opcional…"
          />
        </div>
        <Badge
          variant={p.status === "active" ? "default" : "secondary"}
          className={p.status === "active" ? "bg-success text-success-foreground" : ""}
        >
          {p.status === "active" ? "Publicado" : p.status === "archived" ? "Arquivado" : "Rascunho"}
        </Badge>
        {p.saveState === "saving" ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
          </span>
        ) : p.saveState === "saved" && !p.dirty ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
            <Check className="h-3 w-3" /> Salvo
          </span>
        ) : p.saveState === "error" ? (
          <span
            className="flex items-center gap-1 text-[10px] font-medium text-destructive"
            title={p.saveError ?? "Erro ao salvar"}
          >
            <CircleAlert className="h-3 w-3" /> Erro ao salvar
          </span>
        ) : p.dirty ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Alterações não sincronizadas
          </span>
        ) : null}
        {p.hasUnpublishedChanges && p.status !== "archived" ? (
          <span
            className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            title="O Inbox continua executando a última versão publicada. Publique para aplicar as edições."
          >
            <CircleAlert className="h-3 w-3" /> Alterações não publicadas
          </span>
        ) : null}

      </div>

      <div className="topbar-studio__right">
        <div className="topbar-studio__group">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={p.onUndo}
            disabled={!p.canUndo}
            title="Desfazer"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={p.onRedo}
            disabled={!p.canRedo}
            title="Refazer"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <TriggerPopover
          triggerType={p.triggerType}
          triggerConfig={p.triggerConfig}
          channels={p.channels}
          onSave={p.onSaveTrigger}
        />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1"
          onClick={p.onOpenAnalytics}
        >
          <BarChart3 className="h-3.5 w-3.5" /> Analytics
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1"
          onClick={p.onTest}
          disabled={p.testing}
        >
          {p.testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <TestTube2 className="h-3.5 w-3.5" />
          )}
          Testar
        </Button>

        <Button
          size="sm"
          className="h-7 gap-1 bg-success text-success-foreground hover:bg-success/90"
          onClick={p.onSave}
          disabled={p.saving}
          title="Salvar alterações do fluxo"
        >
          {p.saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : !p.dirty && p.saveState === "saved" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {p.saving ? "Salvando…" : !p.dirty && p.saveState === "saved" ? "Salvo" : "Salvar"}
        </Button>

        {p.status === "active" ? (
          <>
            <Button
              size="sm"
              className="h-7 gap-1"
              onClick={p.onPublish}
              disabled={p.publishing}
              title="Cria uma nova versão publicada com as edições atuais"
            >
              {p.publishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Publicar alterações
            </Button>
            <Button variant="outline" size="sm" className="h-7" onClick={p.onArchive}>
              Arquivar
            </Button>
          </>
        ) : (
          <Button size="sm" className="h-7 gap-1" onClick={p.onPublish} disabled={p.publishing}>
            {p.publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Publicar
          </Button>
        )}

      </div>
    </div>
  );
}

function TriggerPopover({
  triggerType,
  triggerConfig,
  channels,
  onSave,
}: {
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  channels: { id: string; name: string }[];
  onSave: (type: TriggerType, cfg: Record<string, unknown>) => void;
}) {
  const [type, setType] = useState<TriggerType>(triggerType);
  const [channelId, setChannelId] = useState<string>(
    typeof triggerConfig.channel_id === "string" ? triggerConfig.channel_id : "any",
  );
  const [keyword, setKeyword] = useState<string>(
    typeof triggerConfig.keyword === "string" ? triggerConfig.keyword : "",
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1">
          <Settings2 className="h-3.5 w-3.5" /> Gatilho
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-[11px]">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as TriggerType)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (equipe dispara)</SelectItem>
                <SelectItem value="inbound_message">Mensagem recebida</SelectItem>
                <SelectItem value="keyword">Palavra-chave</SelectItem>
                <SelectItem value="transfer">Transferência de conversa</SelectItem>
                <SelectItem value="new_contact">Novo contato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(type === "inbound_message" || type === "keyword" || type === "transfer") && (
            <div className="grid gap-1.5">
              <Label className="text-[11px]">Canal</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Qualquer canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer canal</SelectItem>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === "keyword" && (
            <div className="grid gap-1.5">
              <Label className="text-[11px]">Palavra-chave</Label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="ex: menu, oi, atendente"
                className="h-8"
              />
            </div>
          )}
          <Button
            size="sm"
            onClick={() => {
              const cfg: Record<string, unknown> = {};
              if (channelId && channelId !== "any") cfg.channel_id = channelId;
              if (type === "keyword" && keyword.trim()) cfg.keyword = keyword.trim();
              onSave(type, cfg);
            }}
          >
            Salvar gatilho
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
