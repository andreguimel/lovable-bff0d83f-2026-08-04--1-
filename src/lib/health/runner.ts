import type { HealthCheck, HealthResult, HealthStatus } from "./checks/types";
import { dbCheck } from "./checks/db";
import { realtimeCheck } from "./checks/realtime";
import { aiGatewayCheck } from "./checks/ai-gateway";
import { storageCheck } from "./checks/storage";

export const CHECKS: HealthCheck[] = [dbCheck, realtimeCheck, aiGatewayCheck, storageCheck];

export interface AggregateHealth {
  status: HealthStatus;
  checks: Array<{ name: string; severity: string } & HealthResult>;
  timestamp: string;
}

async function runOne(c: HealthCheck): Promise<HealthResult> {
  return await Promise.race<HealthResult>([
    c.run(),
    new Promise<HealthResult>((resolve) =>
      setTimeout(
        () => resolve({ status: "unhealthy", latencyMs: c.timeoutMs, error: "timeout" }),
        c.timeoutMs,
      ),
    ),
  ]);
}

export async function runHealth(): Promise<AggregateHealth> {
  const results = await Promise.all(
    CHECKS.map(async (c) => ({ name: c.name, severity: c.severity, ...(await runOne(c)) })),
  );
  let worst: HealthStatus = "healthy";
  for (const r of results) {
    if (r.status === "unhealthy" && r.severity === "critical") worst = "unhealthy";
    else if (r.status !== "healthy" && worst === "healthy") worst = "degraded";
  }
  return { status: worst, checks: results, timestamp: new Date().toISOString() };
}
