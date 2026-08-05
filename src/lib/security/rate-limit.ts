/**
 * Rate limit central — token bucket in-memory por chave (userId, ip, endpoint).
 * NÃO é distribuído; suficiente para bloqueio imediato dentro de um worker.
 * Para produção multi-worker migrar para Cloudflare KV / Durable Object.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}
const buckets = new Map<string, Bucket>();

export interface RateLimitPolicy {
  capacity: number; // tokens máximos
  refillPerSec: number; // tokens por segundo
}

export const DEFAULT_POLICIES: Record<string, RateLimitPolicy> = {
  "auth.signin": { capacity: 5, refillPerSec: 0.1 },
  "webhook.inbound": { capacity: 100, refillPerSec: 20 },
  "ai.chat": { capacity: 30, refillPerSec: 1 },
  "mutation.default": { capacity: 60, refillPerSec: 5 },
};

export function checkRate(
  key: string,
  policy: RateLimitPolicy,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: policy.capacity, lastRefill: now };
    buckets.set(key, b);
  }
  const elapsed = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(policy.capacity, b.tokens + elapsed * policy.refillPerSec);
  b.lastRefill = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }
  const retryAfterMs = Math.ceil(((1 - b.tokens) / policy.refillPerSec) * 1000);
  return { allowed: false, retryAfterMs };
}
