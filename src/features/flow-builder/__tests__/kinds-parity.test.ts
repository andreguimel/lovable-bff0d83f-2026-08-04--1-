/**
 * FB-12.1 · Teste anti-regressão de paridade de kinds.
 *
 * Garante que a fonte canônica (blocks/kinds.ts) permanece sincronizada
 * com todos os consumidores:
 *   - blocks/definitions.ts (Registry/UI)
 *   - canvas/v3/tokens.ts (V3_KINDS)
 *   - lib/flow-executor.server.ts (NODE_PLUGINS)
 *   - lib/flows.functions.ts (VALID_NODE_KINDS via PERSISTABLE_NODE_KINDS)
 *
 * Se alguém adicionar um bloco novo em qualquer camada e esquecer de
 * habilitá-lo nas outras, este teste falha.
 *
 * Contexto: em 2026-07-19 (Gate Visual Final) descobriu-se que
 * `menu`, `action`, `flow_connection` e `randomizer` foram adicionados
 * em UI/Runtime nas missões FB-10.4A/B/C/D mas nunca foram habilitados
 * na persistência. Consequência: toast "Erro ao salvar" ao salvar
 * qualquer fluxo contendo esses blocos. Este teste impede recorrência.
 */
import { describe, expect, it } from "bun:test";
import {
  CANONICAL_BLOCK_KINDS,
  LEGACY_KIND_ALIASES,
  PERSISTABLE_NODE_KINDS,
  isPersistableKind,
} from "../blocks/kinds";
import { blockRegistry } from "../blocks/registry";
import "../blocks/definitions";
import { V3_KINDS } from "../canvas/v3/tokens";
const { getPlugin } = await import("@/lib/flow-executor.server");

describe("FB-12.1 · Kinds parity — canonical source of truth", () => {
  it("Registry (definitions.ts) contém exatamente os kinds canônicos", () => {
    const registered = new Set<string>();
    for (const kind of CANONICAL_BLOCK_KINDS) {
      const def = blockRegistry.get(kind);
      expect(def, `kind '${kind}' declarado como canônico mas ausente do Registry (blocks/definitions.ts). Adicione um BlockSpec para ele.`).toBeDefined();
      registered.add(kind);
    }
    // Não pode haver kind registrado que não esteja na fonte canônica.
    for (const kind of blockRegistry.list()) {
      expect(
        CANONICAL_BLOCK_KINDS.includes(kind.kind as (typeof CANONICAL_BLOCK_KINDS)[number]),
        `Registry expõe kind '${kind.kind}' ausente da fonte canônica (blocks/kinds.ts). Adicione-o a CANONICAL_BLOCK_KINDS.`,
      ).toBe(true);
    }
  });

  it("V3_KINDS espelha a fonte canônica", () => {
    for (const kind of CANONICAL_BLOCK_KINDS) {
      expect(V3_KINDS.has(kind), `V3_KINDS não inclui '${kind}'.`).toBe(true);
    }
    expect(V3_KINDS.size).toBe(CANONICAL_BLOCK_KINDS.length);
  });

  it("Runtime (NODE_PLUGINS) resolve executor para todo kind canônico", () => {
    for (const kind of CANONICAL_BLOCK_KINDS) {
      expect(getPlugin(kind), `Sem executor no runtime para o kind canônico '${kind}'. Adicione uma entrada em NODE_PLUGINS.`).not.toBeNull();
    }
  });

  it("Runtime aceita todos os aliases legados", () => {
    for (const alias of LEGACY_KIND_ALIASES) {
      expect(getPlugin(alias), `Alias legado '${alias}' não tem executor. Se descontinuado, remova de LEGACY_KIND_ALIASES.`).not.toBeNull();
    }
  });

  it("Persistência (PERSISTABLE_NODE_KINDS) aceita canônicos + legados", () => {
    for (const kind of CANONICAL_BLOCK_KINDS) {
      expect(isPersistableKind(kind), `Persistência rejeita kind canônico '${kind}'.`).toBe(true);
    }
    for (const alias of LEGACY_KIND_ALIASES) {
      expect(isPersistableKind(alias), `Persistência rejeita alias legado '${alias}'.`).toBe(true);
    }
    expect(PERSISTABLE_NODE_KINDS.length).toBe(
      CANONICAL_BLOCK_KINDS.length + LEGACY_KIND_ALIASES.length,
    );
  });

  it("Regressão específica: os 4 kinds do P0 estão habilitados", () => {
    // Prova explícita — se algum destes falhar, o P0 do FB-12.1 voltou.
    for (const kind of ["menu", "action", "flow_connection", "randomizer"] as const) {
      expect(CANONICAL_BLOCK_KINDS.includes(kind)).toBe(true);
      expect(isPersistableKind(kind)).toBe(true);
      expect(getPlugin(kind)).not.toBeNull();
      expect(blockRegistry.get(kind)).toBeDefined();
    }
  });
});
