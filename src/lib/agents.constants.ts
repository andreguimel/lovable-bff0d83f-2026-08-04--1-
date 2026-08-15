export const AGENT_MODEL_OPTIONS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (rápido, econômico)" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (ultra rápido)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (raciocínio avançado)" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (rápido, inteligente)" },
  { value: "openai/gpt-4o", label: "GPT-4o (alta precisão)" },
  { value: "openai/gpt-4-turbo", label: "GPT-4 Turbo (alta capacidade)" },
  { value: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet (análise profunda)" },
] as const;

export const DEFAULT_AGENT_MODEL = "google/gemini-2.5-flash";

export const AGENT_TOOL_OPTIONS = [
  { id: "crm_lookup", label: "Consultar CRM" },
  { id: "move_funnel", label: "Mover funil" },
  { id: "tag_contact", label: "Marcar tag" },
  { id: "create_task", label: "Criar tarefa" },
  { id: "send_payment_link", label: "Enviar link de pagamento" },
  { id: "schedule_meeting", label: "Agendar reunião" },
  { id: "handoff_human", label: "Transferir para humano" },
  { id: "knowledge_search", label: "Buscar base de conhecimento" },
] as const;
