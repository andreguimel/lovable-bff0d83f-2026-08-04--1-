/**
 * FB-10.3 — Contrato visual dos cards V3 para os 17 kinds.
 *
 * Garante que TODA definição registrada:
 *  - tem preview() para conteúdo configurado (quando o registro fornece);
 *  - devolve rótulo humano em displayKindLabel (sem underscores);
 *  - tem handles compatíveis com o layout multi-out do BlockNodeV3.
 */
import { describe, expect, it } from "bun:test";
import { blockRegistry } from "../blocks/registry";
import "../blocks/definitions";
import { displayKindLabel, isV3Kind } from "../canvas/v3/tokens";

describe("FB-10.3 · block cards V3", () => {
  it("todos os kinds registrados estão cobertos pelo visual V3", () => {
    const defs = blockRegistry.list();
    expect(defs.length).toBeGreaterThan(0);
    for (const d of defs) {
      expect(isV3Kind(d.kind)).toBe(true);
    }
  });

  it("nenhum kindLabel humanizado contém underscore técnico", () => {
    for (const d of blockRegistry.list()) {
      const label = displayKindLabel(d.kind, d.meta.short ?? d.meta.label);
      expect(label).not.toMatch(/_/);
    }
  });

  it("preview do Registry devolve string quando o bloco está configurado", () => {
    const msg = blockRegistry.get("message");
    expect(msg?.preview?.({ body: "Olá!" })).toContain("Olá!");
    const wait = blockRegistry.get("wait");
    expect(wait?.preview?.({ seconds: 30 })).toContain("30");
    const cond = blockRegistry.get("condition");
    expect(cond?.preview?.({ expression: "contact.tag == 'VIP'" })).toContain("VIP");
  });

  it("condition expõe duas saídas para o layout multi-out", () => {
    const cond = blockRegistry.get("condition");
    expect(cond?.meta.handles.out.map((h) => h.id).sort()).toEqual(["false", "true"]);
  });
});
