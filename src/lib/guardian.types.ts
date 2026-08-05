export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type GuardianSeverity = "healthy" | "warning" | "critical";

export type GuardianIncidentKind =
  | "message"
  | "flow"
  | "integration"
  | "channel"
  | "broadcast"
  | "cascade";

export type GuardianIncident = {
  id: string;
  kind: GuardianIncidentKind;
  title: string;
  severity: GuardianSeverity;
  status: string;
  detectedAt: string | null;
  impact: string;
  probableCause: string;
  recommendedAction: string;
  repairAction: "resend_message" | "retry_flow" | "toggle_integration" | "inspect";
  payload: { [key: string]: JsonValue };
};

export type GuardianScanResult = {
  companyId: string;
  status: GuardianSeverity;
  score: number;
  summary: string;
  generatedAt: string;
  health: {
    messagesLastHour: number;
    failuresLast24h: number;
    integrationsOn: number;
    integrationsTotal: number;
    integrationsError: number;
    webhooksLast24h: number;
    channelsOnline: number;
    channelsTotal: number;
    flowFailures24h: number;
  };
  incidents: GuardianIncident[];
  recommendations: Array<{ title: string; body: string; severity: GuardianSeverity }>;
};