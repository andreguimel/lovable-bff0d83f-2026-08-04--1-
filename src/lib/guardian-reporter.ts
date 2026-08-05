// Client-side global error capture for the Guardião.
// Emits deduped events → server function that persists as `guardian_incidents`.
// If the user is not signed in yet, incidents are queued in sessionStorage
// and flushed as soon as an authenticated session becomes available.

import { reportGuardianIncident } from "@/lib/guardian.functions";
import { supabase } from "@/integrations/supabase/client";

type CapturedError = {
  message: string;
  stack?: string;
  route?: string;
  kind: "runtime" | "promise" | "network" | "boundary";
  context?: Record<string, unknown>;
};

type Listener = (incidentId: string, err: CapturedError) => void;

const QUEUE_KEY = "guardian.pending_incidents";
const listeners = new Set<Listener>();
const recentFingerprints = new Map<string, number>(); // fp -> ts
const DEDUPE_MS = 30_000;

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i), h |= 0;
  return String(h);
}

function fingerprintOf(err: CapturedError) {
  return hash(`${err.kind}::${err.message}::${(err.stack ?? "").slice(0, 300)}::${err.route ?? ""}`);
}

function shouldSkip(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("resizeobserver loop") ||
    m.includes("hydration failed") ||
    (m.includes("hydrating") && m.includes("client")) ||
    m.includes("chunkloaderror") ||
    m.includes("loading chunk") ||
    m.includes("importing a module script") ||
    m.includes("script error")
  );
}

function readQueue(): CapturedError[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as CapturedError[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: CapturedError[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-20)));
  } catch {
    // storage may be full / disabled
  }
}

async function hasSession() {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.access_token;
  } catch {
    return false;
  }
}

async function sendOne(err: CapturedError) {
  const res = await reportGuardianIncident({
    data: {
      kind: err.kind,
      message: err.message.slice(0, 1000),
      stack: err.stack?.slice(0, 6000),
      route: err.route ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      fingerprint: fingerprintOf(err),
      context: {
        ...(err.context ?? {}),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      },
    },
  });
  return res?.incidentId as string | undefined;
}

async function flushQueue() {
  const q = readQueue();
  if (q.length === 0) return;
  if (!(await hasSession())) return;
  const remaining: CapturedError[] = [];
  for (const err of q) {
    try {
      const id = await sendOne(err);
      if (id) listeners.forEach((l) => l(id, err));
    } catch {
      remaining.push(err);
    }
  }
  writeQueue(remaining);
}

async function emit(err: CapturedError) {
  try {
    if (shouldSkip(err.message)) return;
    const fp = fingerprintOf(err);
    const now = Date.now();
    const last = recentFingerprints.get(fp);
    if (last && now - last < DEDUPE_MS) return;
    recentFingerprints.set(fp, now);
    if (recentFingerprints.size > 100) {
      for (const [k, v] of recentFingerprints) if (now - v > DEDUPE_MS * 4) recentFingerprints.delete(k);
    }

    if (!(await hasSession())) {
      // Anonymous / pre-login: queue for later.
      const q = readQueue();
      q.push(err);
      writeQueue(q);
      return;
    }

    const id = await sendOne(err);
    if (id) listeners.forEach((l) => l(id, err));
  } catch {
    // never break app on reporter failure
  }
}

let installed = false;
export function installGuardianReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const e = event.error as Error | undefined;
    emit({
      kind: "runtime",
      message: e?.message ?? String(event.message ?? "Erro desconhecido"),
      stack: e?.stack,
      context: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Promise rejeitada sem motivo";
    const stack = reason instanceof Error ? reason.stack : undefined;
    emit({ kind: "promise", message: msg, stack });
  });

  // Flush any queued incidents when a session becomes available.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      void flushQueue();
    }
  });
  // First-load attempt in case a session is already present.
  void flushQueue();
}

export function reportBoundaryError(error: Error, info?: { componentStack?: string }) {
  emit({
    kind: "boundary",
    message: error.message || "Erro em componente React",
    stack: error.stack,
    context: { componentStack: info?.componentStack?.slice(0, 4000) },
  });
}

export function subscribeGuardianIncidents(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

