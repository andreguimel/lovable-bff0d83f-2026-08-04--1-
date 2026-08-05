/**
 * Metrics in-memory (Prometheus-compatible text exposition).
 * Suficiente para observabilidade local + scraping por edge scheduler.
 * NÃO usar como fonte de verdade de longo prazo — persistir eventos importantes em `domain_events`.
 */

type Labels = Record<string, string | number>;

interface CounterSample {
  name: string;
  help: string;
  labels: Labels;
  value: number;
}
interface HistogramSample {
  name: string;
  help: string;
  labels: Labels;
  buckets: Map<number, number>;
  sum: number;
  count: number;
}

const counters = new Map<string, CounterSample>();
const histograms = new Map<string, HistogramSample>();

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function key(name: string, labels: Labels) {
  return (
    name +
    "|" +
    Object.entries(labels)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join(",")
  );
}

export function counter(name: string, help: string, labels: Labels = {}, delta = 1) {
  const k = key(name, labels);
  const existing = counters.get(k);
  if (existing) existing.value += delta;
  else counters.set(k, { name, help, labels, value: delta });
}

export function observe(name: string, help: string, valueMs: number, labels: Labels = {}) {
  const k = key(name, labels);
  let h = histograms.get(k);
  if (!h) {
    h = {
      name,
      help,
      labels,
      buckets: new Map(DEFAULT_BUCKETS.map((b) => [b, 0])),
      sum: 0,
      count: 0,
    };
    histograms.set(k, h);
  }
  h.sum += valueMs;
  h.count += 1;
  for (const b of DEFAULT_BUCKETS) if (valueMs <= b) h.buckets.set(b, (h.buckets.get(b) ?? 0) + 1);
}

export function renderPrometheus(): string {
  const lines: string[] = [];
  const seenHelp = new Set<string>();
  for (const c of counters.values()) {
    if (!seenHelp.has(c.name)) {
      lines.push(`# HELP ${c.name} ${c.help}`, `# TYPE ${c.name} counter`);
      seenHelp.add(c.name);
    }
    const lbl = Object.entries(c.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    lines.push(`${c.name}{${lbl}} ${c.value}`);
  }
  for (const h of histograms.values()) {
    if (!seenHelp.has(h.name)) {
      lines.push(`# HELP ${h.name} ${h.help}`, `# TYPE ${h.name} histogram`);
      seenHelp.add(h.name);
    }
    const baseLbl = Object.entries(h.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    for (const [b, v] of h.buckets) lines.push(`${h.name}_bucket{${baseLbl},le="${b}"} ${v}`);
    lines.push(`${h.name}_bucket{${baseLbl},le="+Inf"} ${h.count}`);
    lines.push(`${h.name}_sum{${baseLbl}} ${h.sum}`);
    lines.push(`${h.name}_count{${baseLbl}} ${h.count}`);
  }
  return lines.join("\n") + "\n";
}
