import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  Star,
  LayoutGrid,
  Zap,
  Filter,
  Rocket,
  GitFork,
  Clock,
  Globe,
  Bot,
  Plus,
  X,
} from "lucide-react";
import { useBuilderStore } from "../state/store";

export interface BlockOption {
  id: string;
  kind: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgLight: string;
  defaultData?: Record<string, unknown>;
}

export const BOTCONVERSA_BLOCK_OPTIONS: BlockOption[] = [
  {
    id: "conteudo",
    kind: "message",
    label: "Conteúdo",
    icon: Star,
    color: "#EF4444",
    bgLight: "#FEF2F2",
    defaultData: {
      items: [
        { type: "text", content: "" }
      ]
    }
  },
  {
    id: "menu",
    kind: "menu",
    label: "Menu",
    icon: LayoutGrid,
    color: "#8B5CF6",
    bgLight: "#F5F3FF",
  },
  {
    id: "acao",
    kind: "action",
    label: "Ação",
    icon: Zap,
    color: "#F59E0B",
    bgLight: "#FFFBEB",
    defaultData: {
      actions: []
    }
  },
  {
    id: "condicao",
    kind: "condition",
    label: "Condição",
    icon: Filter,
    color: "#3B82F6",
    bgLight: "#EFF6FF",
  },
  {
    id: "conexao_fluxo",
    kind: "flow_connection",
    label: "Conexão de fluxo",
    icon: Rocket,
    color: "#10B981",
    bgLight: "#ECFDF5",
  },
  {
    id: "randomizador",
    kind: "randomizer",
    label: "Randomizador",
    icon: GitFork,
    color: "#06B6D4",
    bgLight: "#ECFEFF",
  },
  {
    id: "atraso_inteligente",
    kind: "wait",
    label: "Atraso inteligente",
    icon: Clock,
    color: "#F97316",
    bgLight: "#FFF7ED",
    defaultData: {
      seconds: 259200 // 3 dias por padrão
    }
  },
  {
    id: "integracao",
    kind: "http_request",
    label: "Integração",
    icon: Globe,
    color: "#EC4899",
    bgLight: "#FDF2F8",
  },
  {
    id: "assistente_gpt",
    kind: "ai",
    label: "Assistente GPT",
    icon: Bot,
    color: "#14B8A6",
    bgLight: "#F0FDFA",
  },
];

export function FloatingBlockMenu() {
  const [isOpen, setIsOpen] = useState(true);
  const rf = useReactFlow();
  const addNode = useBuilderStore((s) => s.addNode);

  const handleSelectBlock = (option: BlockOption) => {
    // Calculamos o centro da tela visível no Canvas
    const center = rf.screenToFlowPosition({
      x: window.innerWidth / 2 + (Math.random() * 60 - 30),
      y: window.innerHeight / 2 + (Math.random() * 60 - 30),
    });

    addNode(option.kind, center, option.defaultData);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute top-6 right-6 z-20 flex items-center justify-center w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all transform hover:scale-105"
        title="Adicionar Bloco"
      >
        <Plus className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="absolute top-6 right-6 z-20 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 font-sans transition-all animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-gray-100">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-2">
          Adicionar Bloco
        </span>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1 max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
        {BOTCONVERSA_BLOCK_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              onClick={() => handleSelectBlock(opt)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ backgroundColor: opt.bgLight, color: opt.color }}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="flex-1">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
