export type HealthStatus = "healthy" | "degraded" | "unhealthy";
export type HealthSeverity = "info" | "warning" | "critical";

export interface HealthResult {
  status: HealthStatus;
  latencyMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface HealthCheck {
  name: string;
  timeoutMs: number;
  severity: HealthSeverity;
  run(): Promise<HealthResult>;
}
