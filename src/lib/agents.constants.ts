export const AGENT_MODEL_OPTIONS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (rápido, econômico)" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (mais barato)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (mais capaz)" },
  { value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5", label: "GPT-5" },
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
