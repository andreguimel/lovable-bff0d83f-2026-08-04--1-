/**
 * FB-02 — Registry central de blocos.
 *
 * Único ponto onde blocos são registrados. Consumidores (canvas, inspector,
 * library, validator, serializer) só falam com o Registry — nenhum switch
 * genérico por `kind` deve mais existir no código.
 *
 * Nota FB-02: o registry começa vazio. A migração dos 17 kinds legados
 * acontece em FB-03/FB-04. Enquanto isso, o serializer trata kinds
 * desconhecidos de forma idempotente (round-trip preservado).
 */
import type { BlockDefinition, ValidationResult } from "./types";

class BlockRegistry {
  private defs = new Map<string, BlockDefinition>();

  register<T>(def: BlockDefinition<T>): void {
    if (this.defs.has(def.kind)) {
      // Substituição explícita — útil para hot reload em dev.
      // Um novo `register` sobrescreve o anterior sem lançar.
    }
    this.defs.set(def.kind, def as unknown as BlockDefinition);
  }

  registerAll(defs: BlockDefinition[]): void {
    for (const d of defs) this.register(d);
  }

  has(kind: string): boolean {
    return this.defs.has(kind);
  }

  get<T = Record<string, unknown>>(kind: string): BlockDefinition<T> | undefined {
    return this.defs.get(kind) as BlockDefinition<T> | undefined;
  }

  /**
   * Retorna a definição ou lança se ausente. Uso interno em pontos que
   * exigem contrato garantido (executor de validação, por exemplo).
   */
  require<T = Record<string, unknown>>(kind: string): BlockDefinition<T> {
    const d = this.get<T>(kind);
    if (!d) throw new Error(`Block "${kind}" não registrado`);
    return d;
  }

  list(): BlockDefinition[] {
    return [...this.defs.values()];
  }

  kinds(): string[] {
    return [...this.defs.keys()];
  }

  /** valida um payload de nó contra o registry. Bloco ausente → warning. */
  validate(kind: string, data: unknown): ValidationResult {
    const def = this.defs.get(kind);
    if (!def) {
      return {
        valid: true,
        issues: [
          {
            severity: "warning",
            message: `Bloco "${kind}" ainda não migrado para V2`,
          },
        ],
      };
    }
    if (def.schema) {
      const parsed = def.schema.safeParse(data);
      if (!parsed.success) {
        return {
          valid: false,
          issues: parsed.error.issues.map((i) => ({
            severity: "error",
            path: i.path.join("."),
            message: i.message,
          })),
        };
      }
    }
    if (def.validate) {
      return def.validate(data as never);
    }
    return { valid: true, issues: [] };
  }

  /** apenas para testes / infra (FB-08 stress-test cleanup). */
  unregister(kind: string): boolean {
    return this.defs.delete(kind);
  }

  /** apenas para testes */
  _reset(): void {
    this.defs.clear();
  }
}

export const blockRegistry = new BlockRegistry();
export type { BlockRegistry };
