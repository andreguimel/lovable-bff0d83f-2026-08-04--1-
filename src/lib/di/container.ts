/**
 * Container de Injeção de Dependência minimalista. Evita instanciar
 * providers/services manualmente em cada chamada, facilita testes com fakes.
 *
 * Escopo intencionalmente pequeno: chaves tipadas + factories lazy.
 * NÃO é um framework de DI — se crescer, extrair para um pacote dedicado.
 */

export type Token<T> = symbol & { __type?: T };
export const token = <T>(description: string): Token<T> => Symbol(description) as Token<T>;

type Factory<T> = () => T | Promise<T>;

interface Binding<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

const bindings = new Map<Token<unknown>, Binding<unknown>>();

export function bind<T>(tok: Token<T>, factory: Factory<T>, opts: { singleton?: boolean } = {}) {
  bindings.set(tok as Token<unknown>, {
    factory: factory as Factory<unknown>,
    singleton: opts.singleton ?? true,
  });
}

export async function resolve<T>(tok: Token<T>): Promise<T> {
  const b = bindings.get(tok as Token<unknown>) as Binding<T> | undefined;
  if (!b) throw new Error(`DI: no binding for ${String(tok.description)}`);
  if (b.singleton && b.instance !== undefined) return b.instance;
  const value = await b.factory();
  if (b.singleton) b.instance = value;
  return value;
}

export function reset() {
  bindings.clear();
}
export function has<T>(tok: Token<T>) {
  return bindings.has(tok as Token<unknown>);
}

// Tokens canônicos — cada módulo apenas importa e resolve.
export const TOKENS = {
  Logger: token<typeof import("@/lib/observability/logger").logger>("Logger"),
  Metrics: token<typeof import("@/lib/observability/metrics")>("Metrics"),
  EventBus: token<typeof import("@/lib/events/registry")>("EventBus"),
  FeatureRegistry: token<typeof import("@/lib/features/registry")>("FeatureRegistry"),
} as const;
