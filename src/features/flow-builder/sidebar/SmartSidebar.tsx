/**
 * FB-04 — SmartSidebar.
 *
 * Painel único de configuração de blocos. Filosofia:
 *  - todo bloco usa exatamente este painel (nenhum Drawer/Modal próprio);
 *  - layout FIXO: Header · Tabs · Conteúdo · Validação · Preview · Ações;
 *  - configuração é declarativa (`meta.fields`) — o painel renderiza,
 *    valida e faz preview em tempo real, sem esperar Salvar.
 *
 * Preparado (não implementado nesta missão):
 *  - Tabs adicionais (IA / Avançado / Analytics / Debug / Versionamento)
 *  - Busca de propriedades (Cmd-K dentro do painel)
 *
 * Reuso futuro: o layout foi desenhado como um componente de plataforma
 * (CRM, Inbox, Automações). Nada aqui depende do Flow Builder além do
 * Registry de blocos e da store — trocar essas fontes reaproveita 100%.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { blockRegistry } from "../blocks/registry";
import { useSelectedNode } from "../state/selectors";
import { useBuilderStore } from "../state/store";
import { FieldRenderer, makeErrorLookup } from "../fields/renderer";
import type { FieldSpec } from "../fields/types";
import { SmartSidebarProvider, useSidebarCtx } from "./context";
import type { SidebarCtx } from "../fields/types";

interface Props {
  ctx: SidebarCtx;
}

export function SmartSidebar({ ctx }: Props) {
  const node = useSelectedNode();
  if (!node) return null;
  return (
    <SmartSidebarProvider value={ctx}>
      <SmartSidebarInner key={node.id} />
    </SmartSidebarProvider>
  );
}

function SmartSidebarInner() {
  const node = useSelectedNode();
  const ctx = useSidebarCtx();
  const replaceNodeData = useBuilderStore((s) => s.replaceNodeData);
  const updateNodeData = useBuilderStore((s) => s.updateNodeData);
  const duplicateNode = useBuilderStore((s) => s.duplicateNode);
  const removeNode = useBuilderStore((s) => s.removeNode);
  const clearSelection = useBuilderStore((s) => s.clearSelection);

  // snapshot para Cancelar — capturado no primeiro render do bloco selecionado
  const initialDataRef = useRef<Record<string, unknown> | null>(null);
  if (initialDataRef.current === null && node) {
    initialDataRef.current = JSON.parse(JSON.stringify(node.data));
  }

  // Preparação futura: tabs. Só "Geral" implementada agora.
  const [tab, setTab] = useState<"general">("general");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ESC fecha o painel (comportamento familiar)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !searchOpen) clearSelection();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [clearSelection, searchOpen]);

  if (!node) return null;
  const def = blockRegistry.get(node.kind);
  const meta = def?.meta;
  if (!meta) return null;

  const Icon = meta.icon;
  const isStart = node.kind === "start";

  // Campos: sempre injeta o "Rótulo" como primeiro (padrão da plataforma).
  const declaredFields: FieldSpec[] = (def as { fields?: FieldSpec[] }).fields ?? [];
  const fields: FieldSpec[] = useMemo(
    () => [
      {
        type: "text",
        key: "label",
        label: "Rótulo",
        placeholder: meta.label,
        maxLength: 80,
      } as FieldSpec,
      ...declaredFields,
    ],
    [declaredFields, meta.label],
  );

  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return fields;
    const q = searchQuery.trim().toLowerCase();
    return fields.filter((f) => {
      const label = "label" in f && f.label ? f.label.toLowerCase() : "";
      const key = "key" in f && f.key ? f.key.toLowerCase() : "";
      return label.includes(q) || key.includes(q);
    });
  }, [fields, searchQuery]);

  // Validação em tempo real
  const validation = def?.validate ? def.validate(node.data) : { valid: true, issues: [] };
  const errorLookup = useMemo(
    () => makeErrorLookup(fields, node.data, validation.issues),
    [fields, node.data, validation.issues],
  );

  // Preview inteligente — reusa o mesmo preview do card do canvas
  const previewText = def?.preview?.(node.data) ?? null;

  const onFieldChange = (patch: Record<string, unknown>) => {
    updateNodeData(node.id, patch);
  };

  const onCancel = () => {
    if (initialDataRef.current) {
      replaceNodeData(node.id, initialDataRef.current);
    }
    clearSelection();
  };

  const onSave = () => {
    // Persistência real é feita pelo autosave (800ms) do shell.
    // Aqui só "commit" visualmente: fecha o painel e libera a próxima seleção.
    initialDataRef.current = JSON.parse(JSON.stringify(node.data));
    clearSelection();
  };

  const errorCount = validation.issues.filter((i) => i.severity === "error").length;
  const warningCount = validation.issues.filter((i) => i.severity === "warning").length;

  return (
    <aside className="smart-sidebar" data-testid="smart-sidebar">
      {/* ============ Header ============ */}
      <header className="smart-sidebar__head">
        <span
          className="smart-sidebar__icon"
          style={{ ["--card-accent" as string]: meta.accent }}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="smart-sidebar__title" title={meta.label}>
            {meta.label}
          </p>
          <p className="smart-sidebar__subtitle" title={meta.short}>
            {meta.short}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSearchOpen((v) => !v)}
          title="Buscar propriedade"
          aria-label="Buscar propriedade"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={clearSelection}
          title="Fechar (Esc)"
          aria-label="Fechar painel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      {/* ============ Tabs (arquitetura pronta) ============ */}
      <div className="smart-sidebar__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "general"}
          className={"smart-sidebar__tab " + (tab === "general" ? "is-active" : "")}
          onClick={() => setTab("general")}
        >
          Geral
        </button>
        {/* Futuras: IA · Avançado · Analytics · Debug · Versionamento */}
      </div>

      {searchOpen && (
        <div className="smart-sidebar__search">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar propriedade… (ex: delay, url)"
            className="flex-1 bg-transparent text-xs outline-none"
          />
        </div>
      )}

      {/* ============ Conteúdo ============ */}
      <div className="smart-sidebar__body">
        {filteredFields.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nenhuma propriedade encontrada.
          </p>
        ) : (
          filteredFields.map((f, i) => (
            <FieldRenderer
              key={("key" in f && f.key) || `field-${i}`}
              field={f}
              data={node.data}
              ctx={ctx}
              errorFor={errorLookup}
              onChange={onFieldChange}
            />
          ))
        )}
      </div>

      {/* ============ Validação ============ */}
      <div className="smart-sidebar__validation" data-testid="smart-sidebar-validation">
        {errorCount === 0 && warningCount === 0 ? (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Configuração válida
          </p>
        ) : (
          <ul className="space-y-1">
            {validation.issues.map((i, idx) => (
              <li
                key={idx}
                className={
                  "flex items-start gap-1.5 text-[11px] " +
                  (i.severity === "error"
                    ? "text-destructive"
                    : "text-amber-600 dark:text-amber-400")
                }
              >
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ============ Preview ============ */}
      <div className="smart-sidebar__preview" data-testid="smart-sidebar-preview">
        <p className="smart-sidebar__preview-label">Prévia no canvas</p>
        <div
          className="smart-sidebar__preview-card"
          style={{ ["--card-accent" as string]: meta.accent }}
        >
          <span className="smart-sidebar__preview-icon" aria-hidden>
            <Icon className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <p className="smart-sidebar__preview-title">
              {typeof node.data.label === "string" && node.data.label
                ? (node.data.label as string)
                : meta.label}
            </p>
            <p className="smart-sidebar__preview-body">
              {previewText ?? <span className="italic opacity-60">sem prévia</span>}
            </p>
          </div>
        </div>
      </div>

      {/* ============ Ações ============ */}
      <footer className="smart-sidebar__actions">
        {!isStart && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => duplicateNode(node.id)}
              title="Duplicar"
            >
              <Copy className="mr-1 h-3 w-3" /> Duplicar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-destructive hover:text-destructive"
              onClick={() => {
                removeNode(node.id);
                clearSelection();
              }}
              title="Excluir"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Excluir
            </Button>
          </>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          size="sm"
          className="h-7"
          onClick={onSave}
          disabled={errorCount > 0}
          title={errorCount > 0 ? "Corrija os erros antes de salvar" : "Salvar (autosave ativo)"}
        >
          Salvar
        </Button>
      </footer>
    </aside>
  );
}
