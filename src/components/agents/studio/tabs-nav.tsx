export type StudioTabId =
  | "geral"
  | "prompt"
  | "ferramentas"
  | "conhecimento"
  | "memoria"
  | "fluxos"
  | "integracoes"
  | "conversas"
  | "logs"
  | "testes"
  | "analytics";

const TABS: { id: StudioTabId; label: string }[] = [
  { id: "geral", label: "Geral" },
  { id: "prompt", label: "Prompt" },
  { id: "ferramentas", label: "Ferramentas" },
  { id: "conhecimento", label: "Conhecimento" },
  { id: "memoria", label: "Memória" },
  { id: "fluxos", label: "Fluxos" },
  { id: "integracoes", label: "Integrações" },
  { id: "conversas", label: "Conversas" },
  { id: "logs", label: "Logs" },
  { id: "testes", label: "Testes" },
  { id: "analytics", label: "Analytics" },
];

export function StudioTabsNav({
  active,
  onChange,
}: {
  active: StudioTabId;
  onChange: (v: StudioTabId) => void;
}) {
  return (
    <div className="studio-tabs-nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className="studio-tab-btn"
          data-active={active === t.id}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
