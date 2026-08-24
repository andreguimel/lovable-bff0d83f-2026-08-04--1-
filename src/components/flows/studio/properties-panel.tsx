import { useState } from "react";
import {
  Trash2,
  Copy,
  GripVertical,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Plus,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaPicker, type MediaKind } from "@/components/flows/media-picker";
import { VariablePickerPopover } from "@/components/flows/variable-picker-popover";
import { BLOCKS, type NodeKind } from "./blocks";
import type { ActionItem, FlowNodeData } from "./custom-node";

const PRESET_VARIABLES = [
  {
    group: "Campos do Sistema (BotConversa)",
    items: [
      { value: "nome-completo", label: "👤 Nome Completo ({nome-completo})" },
      { value: "primeiro-nome", label: "👤 Primeiro Nome ({primeiro-nome})" },
      { value: "sobrenome", label: "👤 Sobrenome ({sobrenome})" },
      { value: "telefone", label: "📱 Telefone ({telefone})" },
      { value: "ddd", label: "📞 DDD ({ddd})" },
      { value: "email", label: "✉️ E-mail ({email})" },
      { value: "nome-indicador", label: "🤝 Nome do Indicador ({nome-indicador})" },
      { value: "numero-de-indicacoes", label: "🔢 Nº de Indicações ({numero-de-indicacoes})" },
      { value: "codigo-indicacao", label: "🏷️ Código de Indicação ({codigo-indicacao})" },
    ],
  },
  {
    group: "Dados do Contato & Sistema",
    items: [
      { value: "contact.name", label: "👤 Nome do Contato (contact.name)" },
      { value: "contact.phone", label: "📱 Telefone (contact.phone)" },
      { value: "contact.email", label: "✉️ E-mail (contact.email)" },
      { value: "contact.tags", label: "🏷️ Etiquetas (contact.tags)" },
      { value: "canal", label: "📡 Nome do Canal ({canal})" },
      { value: "empresa", label: "🏢 Nome da Empresa ({empresa})" },
      { value: "atendente", label: "👨‍💼 Nome do Atendente ({atendente})" },
    ],
  },
  {
    group: "Mensagens & Respostas",
    items: [
      { value: "last_message", label: "💬 Última Mensagem do Contato (last_message)" },
      { value: "reply", label: "✏️ Resposta da Pergunta Anterior (reply)" },
      { value: "ai.output", label: "🤖 Resposta do Agente IA (ai.output)" },
    ],
  },
  {
    group: "Integrações & Webhooks",
    items: [
      { value: "http.status", label: "🌐 Status HTTP (http.status)" },
      { value: "http.body", label: "📦 Resposta do Webhook (http.body)" },
    ],
  },
];

function VariableSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const isPreset = PRESET_VARIABLES.some((g) =>
    g.items.some((i) => i.value === value)
  );
  const [isCustom, setIsCustom] = useState(!isPreset && value !== "");

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">Campo ou Variável</Label>
      {!isCustom ? (
        <Select
          value={isPreset ? value : ""}
          onValueChange={(val) => {
            if (val === "__custom__") {
              setIsCustom(true);
            } else {
              onChange(val);
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Selecione uma variável disponível..." />
          </SelectTrigger>
          <SelectContent>
            {PRESET_VARIABLES.map((group) => (
              <SelectGroup key={group.group}>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">
                  {group.group}
                </SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-xs">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            <SelectGroup>
              <SelectItem value="__custom__" className="text-xs text-primary font-medium">
                ✍️ Digitar variável personalizada...
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-1.5">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="ex: contact.cpf, http.body.user.id"
            className="h-7 text-xs font-mono flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() => setIsCustom(false)}
          >
            Lista
          </Button>
        </div>
      )}
    </div>
  );
}

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
  const meta = BLOCKS[kind] ?? BLOCKS.message;
  const Icon = meta.icon;
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const [openActionIndex, setOpenActionIndex] = useState<number | null>(0);

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

  const updateAction = (index: number, patch: Partial<ActionItem>) => {
    const nextActions = [...actions];
    nextActions[index] = { ...nextActions[index], ...patch };
    onChange({ actions: nextActions });
  };

  const removeAction = (index: number) => {
    const nextActions = actions.filter((_, i) => i !== index);
    onChange({ actions: nextActions });
  };

  const moveAction = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= actions.length) return;
    const nextActions = [...actions];
    const [removed] = nextActions.splice(index, 1);
    nextActions.splice(targetIndex, 0, removed);
    onChange({ actions: nextActions });
    setOpenActionIndex(targetIndex);
  };

  const addAction = (newKind: NodeKind) => {
    const newItem: ActionItem = {
      id: crypto.randomUUID(),
      kind: newKind,
      label: BLOCKS[newKind]?.label ?? "Nova Função",
      body: newKind === "message" ? "" : undefined,
      seconds: newKind === "wait" ? 5 : undefined,
      tag: newKind === "tag" ? "" : undefined,
    };

    let baseActions = actions;
    if (baseActions.length === 0 && kind !== "start" && kind !== "condition" && kind !== "end") {
      baseActions = [
        {
          id: crypto.randomUUID(),
          kind: data.__kind ?? "message",
          label: (data.label as string) || BLOCKS[data.__kind]?.label,
          body: data.body as string,
          seconds: data.seconds as number,
          tag: data.tag as string,
          agent_id: data.agent_id as string,
          url: data.url as string,
          method: data.method as string,
          media_url: data.media_url as string,
          media_filename: data.media_filename as string,
          media_mime: data.media_mime as string,
          media_size: data.media_size as number,
          is_voice: data.is_voice as boolean,
        },
      ];
    }
    const nextActions = [...baseActions, newItem];
    onChange({ actions: nextActions });
    setOpenActionIndex(nextActions.length - 1);
  };

  return (
    <aside className="properties-panel overflow-y-auto">
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

      <div className="properties-panel__body space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="label" className="text-[11px] text-muted-foreground">
            Título do Bloco
          </Label>
          <Input
            id="label"
            value={typeof data.label === "string" ? data.label : ""}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={meta.label}
            className="h-8 text-xs"
          />
        </div>

        {/* SECÃO DE FUNÇÕES / SUB-AÇÕES EMPILHADAS (PADRÃO BOTCONVERSA) */}
        {kind !== "start" && kind !== "condition" && kind !== "end" && (
          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Funções do Bloco ({actions.length})
              </span>
              <Select onValueChange={(val) => addAction(val as NodeKind)}>
                <SelectTrigger className="h-7 text-[11px] px-2 w-auto gap-1">
                  <Plus className="h-3 w-3" />
                  <span>Adicionar Função</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">💬 Enviar mensagem (Texto)</SelectItem>
                  <SelectItem value="send_image">🖼️ Enviar imagem</SelectItem>
                  <SelectItem value="send_audio">🎵 Enviar áudio</SelectItem>
                  <SelectItem value="send_video">🎥 Enviar vídeo</SelectItem>
                  <SelectItem value="send_document">📄 Enviar arquivo</SelectItem>
                  <SelectItem value="tag">🏷️ Aplicar tag</SelectItem>
                  <SelectItem value="assign_agent">👤 Atribuir atendente</SelectItem>
                  <SelectItem value="wait">⏱️ Aguardar tempo (Delay)</SelectItem>
                  <SelectItem value="webhook">🔔 Disparar Webhook</SelectItem>
                  <SelectItem value="http_request">🌐 Requisição HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {actions.length > 0 ? (
              <div className="space-y-2 mt-2">
                {actions.map((act, idx) => {
                  const actMeta = BLOCKS[act.kind] ?? BLOCKS.message;
                  const ActIcon = actMeta.icon;
                  const isOpen = openActionIndex === idx;
                  const actMediaKind: MediaKind | null =
                    act.kind === "send_image"
                      ? "image"
                      : act.kind === "send_audio"
                        ? "audio"
                        : act.kind === "send_video"
                          ? "video"
                          : act.kind === "send_document"
                            ? "document"
                            : null;

                  return (
                    <div
                      key={act.id || idx}
                      className="rounded-lg border border-border/70 bg-card/60 overflow-hidden text-xs"
                    >
                      {/* ACCORDION HEADER */}
                      <div
                        className="flex items-center justify-between px-3 py-2 bg-muted/40 cursor-pointer select-none hover:bg-muted/70"
                        onClick={() => setOpenActionIndex(isOpen ? null : idx)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {idx + 1}.
                          </span>
                          <ActIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-medium truncate text-foreground">
                            {act.label || actMeta.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveAction(idx, "up");
                            }}
                            className="p-1 hover:bg-background/80 rounded disabled:opacity-30"
                            title="Mover para cima"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === actions.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveAction(idx, "down");
                            }}
                            className="p-1 hover:bg-background/80 rounded disabled:opacity-30"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAction(idx);
                            }}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                            title="Remover função"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          {isOpen ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
                        </div>
                      </div>

                      {/* ACCORDION CONTENT */}
                      {isOpen && (
                        <div className="p-3 space-y-3 bg-background/40 border-t border-border/40">
                          {(act.kind === "message" || act.kind === "question") && (
                            <div className="grid gap-1.5">
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] text-muted-foreground">Mensagem</Label>
                                <VariablePickerPopover
                                  onSelect={(tag) => updateAction(idx, { body: (act.body || "") + tag })}
                                />
                              </div>
                              <div className="flex flex-wrap gap-1 mb-0.5">
                                {[
                                  { label: "primeiro-nome", tag: "{primeiro-nome}" },
                                  { label: "telefone", tag: "{telefone}" },
                                  { label: "email", tag: "{email}" },
                                ].map((item) => (
                                  <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => updateAction(idx, { body: (act.body || "") + item.tag })}
                                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                  >
                                    +{item.label}
                                  </button>
                                ))}
                              </div>
                              <Textarea
                                rows={3}
                                value={act.body || ""}
                                onChange={(e) => updateAction(idx, { body: e.target.value })}
                                placeholder="Digite a mensagem... Use {primeiro-nome}, {telefone}, etc."
                                className="resize-none text-xs"
                              />
                            </div>
                          )}

                          {act.kind === "wait" && (
                            <div className="space-y-2">
                              <div className="grid gap-1.5">
                                <Label className="text-[10px] text-muted-foreground">Aguardar (segundos)</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={act.seconds || 5}
                                  onChange={(e) => updateAction(idx, { seconds: Number(e.target.value) || 1 })}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="flex items-center justify-between rounded border border-border/50 bg-card/30 px-2.5 py-1.5">
                                <span className="text-[11px] text-foreground font-medium">Simular "digitando..."</span>
                                <Switch
                                  checked={!!act.is_typing}
                                  onCheckedChange={(v) => updateAction(idx, { is_typing: v })}
                                />
                              </div>
                            </div>
                          )}

                          {act.kind === "tag" && (
                            <div className="grid gap-1.5">
                              <Label className="text-[10px] text-muted-foreground">Nome da Tag</Label>
                              <Input
                                value={act.tag || ""}
                                onChange={(e) => updateAction(idx, { tag: e.target.value })}
                                placeholder="Ex: VIP, cliente_novo"
                                className="h-7 text-xs"
                              />
                            </div>
                          )}

                          {act.kind === "assign_agent" && (
                            <div className="grid gap-1.5">
                              <Label className="text-[10px] text-muted-foreground">Atendente</Label>
                              <Select
                                value={act.agent_id || ""}
                                onValueChange={(v) => updateAction(idx, { agent_id: v })}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Selecione..." />
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

                          {act.kind === "webhook" && (
                            <div className="grid gap-1.5">
                              <Label className="text-[10px] text-muted-foreground">URL Webhook</Label>
                              <Input
                                value={act.url || ""}
                                onChange={(e) => updateAction(idx, { url: e.target.value })}
                                placeholder="https://..."
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                          )}

                          {actMediaKind && (
                            <div className="space-y-2">
                              <MediaPicker
                                kind={actMediaKind}
                                flowId={flowId}
                                value={{
                                  url: act.media_url,
                                  filename: act.media_filename,
                                  mime_type: act.media_mime,
                                  size: act.media_size,
                                }}
                                onChange={(v) =>
                                  updateAction(idx, {
                                    media_url: v.url,
                                    media_filename: v.filename,
                                    media_mime: v.mime_type,
                                    media_size: v.size,
                                  })
                                }
                              />
                              {(act.kind === "send_image" || act.kind === "send_video" || act.kind === "send_document") && (
                                <div className="grid gap-1">
                                  <Label className="text-[10px] text-muted-foreground">Legenda (opcional)</Label>
                                  <Input
                                    value={act.caption || ""}
                                    onChange={(e) => updateAction(idx, { caption: e.target.value })}
                                    placeholder="Legenda da mídia..."
                                    className="h-7 text-xs"
                                  />
                                </div>
                              )}
                              {act.kind === "send_audio" && (
                                <div className="flex items-center justify-between rounded border border-border/50 bg-card/30 px-2.5 py-1.5">
                                  <span className="text-[11px] text-foreground font-medium">Voz (PTT WhatsApp)</span>
                                  <Switch
                                    checked={!!act.is_voice}
                                    onCheckedChange={(v) => updateAction(idx, { is_voice: v })}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* GERENCIADOR DE BOTÕES INTERATIVOS (PADRÃO BOTCONVERSA) */}
            <div className="space-y-2 border-t border-border/60 pt-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  🔘 Botões de Resposta ({Array.isArray(data.buttons) ? data.buttons.length : 0}/3)
                </span>
                {(!Array.isArray(data.buttons) || data.buttons.length < 3) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2 gap-1"
                    onClick={() => {
                      const cur = Array.isArray(data.buttons) ? data.buttons : [];
                      const next = [...cur, { id: String(cur.length + 1), label: `Opção ${cur.length + 1}` }];
                      onChange({ buttons: next });
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    <span>Botão</span>
                  </Button>
                )}
              </div>
              {Array.isArray(data.buttons) && data.buttons.length > 0 ? (
                <div className="space-y-1.5 mt-2">
                  {data.buttons.map((btn, bIdx) => (
                    <div key={btn.id || bIdx} className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono text-muted-foreground w-4">
                        {bIdx + 1}.
                      </span>
                      <Input
                        value={btn.label}
                        onChange={(e) => {
                          const cur = [...(data.buttons || [])];
                          cur[bIdx] = { ...cur[bIdx], label: e.target.value };
                          onChange({ buttons: cur });
                        }}
                        placeholder="Rótulo do botão..."
                        className="h-7 text-xs flex-1"
                        maxLength={20}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const cur = (data.buttons || []).filter((_, i) => i !== bIdx);
                          onChange({ buttons: cur });
                        }}
                        className="p-1 text-destructive hover:bg-destructive/10 rounded"
                        title="Remover botão"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground italic">
                    Cada botão cria uma porta de saída própria no canvas para ramificar a conversa.
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground italic px-1 py-1">
                  Nenhum botão de resposta adicionado. Adicione até 3 botões por mensagem.
                </p>
              )}
            </div>
          </div>
        )}

        {/* CAMPOS INDIVIDUAIS DE NÓ ÚNICO (LEGADO / COMPATIBILIDADE) */}
        {actions.length === 0 && (
          <>
            {(kind === "message" || kind === "question") && (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="body" className="text-[11px] text-muted-foreground">
                    Conteúdo da Mensagem
                  </Label>
                  <VariablePickerPopover
                    onSelect={(tag) => onChange({ body: (typeof data.body === "string" ? data.body : "") + tag })}
                  />
                </div>
                <div className="flex flex-wrap gap-1 mb-0.5">
                  {[
                    { label: "primeiro-nome", tag: "{primeiro-nome}" },
                    { label: "telefone", tag: "{telefone}" },
                    { label: "email", tag: "{email}" },
                    { label: "nome-completo", tag: "{nome-completo}" },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onChange({ body: (typeof data.body === "string" ? data.body : "") + item.tag })}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      +{item.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  id="body"
                  rows={5}
                  value={typeof data.body === "string" ? data.body : ""}
                  onChange={(e) => onChange({ body: e.target.value })}
                  placeholder="Digite a mensagem enviada ao contato… Ex: Olá {primeiro-nome}, seu número é {telefone}"
                  className="resize-none text-sm"
                />
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
              <div className="space-y-4">
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Defina as condições e regra lógica para que o fluxo continue pela saída superior deste bloco:
                </p>

                {/* SELEÇÃO DE LÓGICA: TODAS (E) / QUALQUER (OU) */}
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="radio"
                      name="condition_logic"
                      checked={(data.logic || "ALL") === "ALL"}
                      onChange={() => onChange({ logic: "ALL" })}
                      className="text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Contato corresponde a <b>TODAS</b> condições</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="radio"
                      name="condition_logic"
                      checked={data.logic === "ANY"}
                      onChange={() => onChange({ logic: "ANY" })}
                      className="text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Contato corresponde a <b>QUALQUER</b> condição</span>
                  </label>
                </div>

                {/* LÓGICA ATIVA SUBTITLE (ESTILO BOTCONVERSA) */}
                <div className="text-xs font-bold text-foreground pt-1">
                  {(data.logic || "ALL") === "ALL" ? "Lógica E" : "Lógica OU"}
                </div>

                {/* CARDS DE CONDIÇÕES CONFIGURADAS */}
                {Array.isArray(data.conditions) && data.conditions.length > 0 && (
                  <div className="space-y-2.5">
                    {data.conditions.map((c: any, cIdx: number) => {
                      const updateRule = (patch: Record<string, any>) => {
                        const cur = [...(data.conditions as any[])];
                        cur[cIdx] = { ...cur[cIdx], ...patch };
                        onChange({ conditions: cur });
                      };

                      const removeRule = () => {
                        const cur = (data.conditions as any[]).filter((_, i) => i !== cIdx);
                        onChange({ conditions: cur });
                      };

                      return (
                        <div
                          key={c.id || cIdx}
                          className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-card/80 p-3.5 space-y-1.5 text-xs relative"
                        >
                          <button
                            type="button"
                            onClick={removeRule}
                            className="absolute top-2.5 right-2.5 p-1 text-muted-foreground hover:text-destructive rounded"
                            title="Remover condição"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>

                          <div className="font-semibold text-foreground text-xs pr-6">
                            {c.type === "tag" && "Etiqueta"}
                            {c.type === "weekday" && "Dia da Semana ao passar por aqui"}
                            {c.type === "business_hours" && "In opening hours when passing by here"}
                            {c.type === "time_window" && "Hora ao passar por aqui"}
                            {c.type === "assigned_agent" && "Atendimento está atribuído para um atendente"}
                            {c.type === "custom_field" && (c.field || "Campo do contato ou variável")}
                          </div>

                          <div className="text-[11px] font-medium text-muted-foreground uppercase">
                            {c.type === "tag" ? (c.tag_operator === "has_not" ? "NÃO É" : "É") : "É"}
                          </div>

                          <div className="font-semibold text-foreground text-xs pt-0.5">
                            {c.type === "business_hours" && (
                              <Select
                                value={c.business_hours_operator || "open"}
                                onValueChange={(v) => updateRule({ business_hours_operator: v })}
                              >
                                <SelectTrigger className="h-7 text-xs bg-background">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">Aberto</SelectItem>
                                  <SelectItem value="closed">Fechado</SelectItem>
                                </SelectContent>
                              </Select>
                            )}

                            {c.type === "tag" && (
                              <Input
                                value={c.tag_name || ""}
                                onChange={(e) => updateRule({ tag_name: e.target.value })}
                                placeholder="Nome da etiqueta (ex: VIP)"
                                className="h-7 text-xs bg-background"
                              />
                            )}

                            {c.type === "weekday" && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {[
                                  { id: 1, label: "Seg" },
                                  { id: 2, label: "Ter" },
                                  { id: 3, label: "Qua" },
                                  { id: 4, label: "Qui" },
                                  { id: 5, label: "Sex" },
                                  { id: 6, label: "Sáb" },
                                  { id: 0, label: "Dom" },
                                ].map((day) => {
                                  const active = (c.weekdays || []).includes(day.id);
                                  return (
                                    <button
                                      key={day.id}
                                      type="button"
                                      onClick={() => {
                                        const curDays = c.weekdays || [];
                                        const nextDays = active
                                          ? curDays.filter((d: number) => d !== day.id)
                                          : [...curDays, day.id];
                                        updateRule({ weekdays: nextDays });
                                      }}
                                      className={`px-2 py-0.5 text-[10px] rounded font-medium border ${
                                        active
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-background text-muted-foreground border-border/50"
                                      }`}
                                    >
                                      {day.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {c.type === "time_window" && (
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="time"
                                  value={c.start_time || "08:00"}
                                  onChange={(e) => updateRule({ start_time: e.target.value })}
                                  className="h-7 text-xs bg-background"
                                />
                                <Input
                                  type="time"
                                  value={c.end_time || "18:00"}
                                  onChange={(e) => updateRule({ end_time: e.target.value })}
                                  className="h-7 text-xs bg-background"
                                />
                              </div>
                            )}

                            {c.type === "assigned_agent" && (
                              <Select
                                value={c.agent_user_id || ""}
                                onValueChange={(v) => {
                                  const ag = agents.find((a) => a.id === v);
                                  updateRule({ agent_user_id: v, agent_user_name: ag?.name || "" });
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs bg-background">
                                  <SelectValue placeholder="Selecione um atendente..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {agents.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                      {a.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}

                            {c.type === "custom_field" && (
                              <div className="space-y-1.5 pt-1">
                                <VariableSelect
                                  value={c.field || ""}
                                  onChange={(v) => updateRule({ field: v })}
                                />
                                <div className="grid grid-cols-2 gap-1.5">
                                  <Select
                                    value={c.operator || "equals"}
                                    onValueChange={(v) => updateRule({ operator: v })}
                                  >
                                    <SelectTrigger className="h-7 text-xs bg-background">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="equals">é igual a</SelectItem>
                                      <SelectItem value="not_equals">é diferente de</SelectItem>
                                      <SelectItem value="contains">contém</SelectItem>
                                      <SelectItem value="not_contains">não contém</SelectItem>
                                      <SelectItem value="exists">existe</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    value={c.value || ""}
                                    onChange={(e) => updateRule({ value: e.target.value })}
                                    placeholder="Valor..."
                                    className="h-7 text-xs bg-background"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* DROPDOWN "Selecionar Condição" (ESTILO BOTCONVERSA) */}
                <div className="pt-1">
                  <Select
                    onValueChange={(val) => {
                      const cur = Array.isArray(data.conditions) ? data.conditions : [];
                      const type = val as any;
                      const newRule: any = {
                        id: String(Date.now() + Math.random()),
                        type,
                        tag_operator: "has",
                        business_hours_operator: "open",
                        start_time: "08:00",
                        end_time: "18:00",
                        weekdays: [1, 2, 3, 4, 5],
                        field: "contact.name",
                        operator: "equals",
                        value: "",
                      };
                      onChange({ conditions: [...cur, newRule] });
                    }}
                  >
                    <SelectTrigger className="h-10 text-xs w-full justify-between border-primary/40 bg-background text-foreground font-medium rounded-lg shadow-sm">
                      <SelectValue placeholder="Selecionar Condição" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5">
                          OPERAÇÕES MAIS USADAS
                        </SelectLabel>
                        <SelectItem value="tag" className="text-xs">Etiqueta</SelectItem>
                        <SelectItem value="weekday" className="text-xs">Dia da Semana ao passar por aqui</SelectItem>
                        <SelectItem value="business_hours" className="text-xs">Horário de Atendimento</SelectItem>
                        <SelectItem value="time_window" className="text-xs">Hora ao passar por aqui</SelectItem>
                        <SelectItem value="assigned_agent" className="text-xs">Atendimento está atribuído para um atendente</SelectItem>
                        <SelectItem value="custom_field" className="text-xs">Campo do contato ou variável</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
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

            {kind === "transfer" && (
              <div className="space-y-3">
                <div className="grid gap-1.5">
                  <Label className="text-[11px] font-semibold text-foreground">Modo de Atribuição</Label>
                  <div className="grid gap-1.5 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                      <input
                        type="radio"
                        name="transfer_target_type"
                        checked={(data.target_type || "queue") === "queue"}
                        onChange={() => onChange({ target_type: "queue" })}
                        className="text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <span>Fila Geral (Inbox sem operador fixo)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                      <input
                        type="radio"
                        name="transfer_target_type"
                        checked={data.target_type === "agent"}
                        onChange={() => onChange({ target_type: "agent" })}
                        className="text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <span>Atendente / Membro Específico</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                      <input
                        type="radio"
                        name="transfer_target_type"
                        checked={data.target_type === "department"}
                        onChange={() => onChange({ target_type: "department" })}
                        className="text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <span>Equipe / Departamento</span>
                    </label>
                  </div>
                </div>

                {data.target_type === "agent" && (
                  <div className="grid gap-1.5">
                    <Label className="text-[11px] text-muted-foreground">Atendente Responsável</Label>
                    <Select
                      value={typeof data.agent_id === "string" ? data.agent_id : ""}
                      onValueChange={(v) => {
                        const ag = agents.find((a) => a.id === v);
                        onChange({ agent_id: v, agent_label: ag?.name || "" });
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Selecione um atendente…" />
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

                {data.target_type === "department" && (
                  <div className="grid gap-1.5">
                    <Label className="text-[11px] text-muted-foreground">Equipe / Departamento</Label>
                    <Select
                      value={typeof data.department === "string" ? data.department : "Vendas"}
                      onValueChange={(v) => onChange({ department: v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Selecione o departamento…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Vendas">💼 Vendas / Comercial</SelectItem>
                        <SelectItem value="Suporte">🎧 Suporte Técnico</SelectItem>
                        <SelectItem value="Financeiro">💰 Financeiro / Cobrança</SelectItem>
                        <SelectItem value="Atendimento">💬 Atendimento Geral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label className="text-[11px] text-muted-foreground">Nota / Instrução (opcional)</Label>
                  <Textarea
                    value={typeof data.transfer_message === "string" ? data.transfer_message : ""}
                    onChange={(e) => onChange({ transfer_message: e.target.value })}
                    placeholder="Ex: Cliente qualificado com interesse no plano PRO..."
                    rows={3}
                    className="resize-none text-xs"
                  />
                </div>
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
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-primary">Esperar resposta sem tempo definido</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  O fluxo pausa neste bloco sem tempo definido (sem limite de expiração). A próxima mensagem enviada pelo contato retoma a execução automaticamente.
                </p>
              </div>
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
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="properties-panel__foot">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <GripVertical className="h-3 w-3" /> Alterações salvas automaticamente.
        </p>
      </footer>
    </aside>
  );
}

