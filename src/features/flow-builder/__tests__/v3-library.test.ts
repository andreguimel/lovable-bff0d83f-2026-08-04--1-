/**
 * FB-10.2 — Testes da NodeLibraryPanelV3.
 *
 * Escopo:
 *  - `categorizeBlocks` respeita a ordem canônica das categorias.
 *  - Kinds ocultos (START) NÃO aparecem na paleta.
 *  - Categorias funcionais têm blocos; categorias "Em breve" vêm vazias.
 *  - 17 blocos legados são classificados de forma humana e determinística.
 */
import { describe, expect, it } from "bun:test";
import "../blocks/definitions"; // garante registro dos blocos legados
import { blockRegistry } from "../blocks/registry";
import {
  categorizeBlocks,
  HIDDEN_KINDS,
  V3_LIBRARY_CATEGORIES,
} from "../library/v3/categories";

describe("FB-10.2 · NodeLibraryPanelV3 · categorizeBlocks", () => {
  const defs = blockRegistry.list();
  const grouped = categorizeBlocks(defs);

  it("mantém a ordem canônica das categorias V3", () => {
    expect(grouped.map((g) => g.category.id)).toEqual(
      V3_LIBRARY_CATEGORIES.map((c) => c.id),
    );
  });

  it("START é ocultado da paleta (protegido contra criação acidental)", () => {
    expect(HIDDEN_KINDS.has("start")).toBe(true);
    for (const g of grouped) {
      expect(g.blocks.some((b) => b.kind === "start")).toBe(false);
    }
  });

  it("nenhuma categoria fica em 'Em breve' pós-FB-10.4D", () => {
    const soon = grouped.filter((g) => g.category.comingSoon);
    expect(soon.length).toBe(0);
  });

  it("randomizer aparece na categoria 'random' (FB-10.4D)", () => {
    const rnd = grouped.find((g) => g.category.id === "random");
    expect(rnd?.category.comingSoon).toBeFalsy();
    expect(rnd?.blocks.some((b) => b.kind === "randomizer")).toBe(true);
  });

  it("categorias funcionais têm ao menos um bloco cada", () => {
    const functional = grouped.filter((g) => !g.category.comingSoon);
    for (const g of functional) {
      expect(g.blocks.length).toBeGreaterThan(0);
    }
  });

  it("flow_connection aparece na categoria 'flow'", () => {
    const flow = grouped.find((g) => g.category.id === "flow");
    expect(flow?.blocks.some((b) => b.kind === "flow_connection")).toBe(true);
  });


  it("blocos-chave estão classificados corretamente", () => {
    const find = (kind: string) =>
      grouped.find((g) => g.blocks.some((b) => b.kind === kind))?.category.id;
    expect(find("message")).toBe("content");
    expect(find("send_audio")).toBe("content");
    expect(find("wait")).toBe("wait");
    expect(find("wait_reply")).toBe("wait");
    expect(find("condition")).toBe("logic");
    expect(find("ai")).toBe("ai");
    expect(find("http_request")).toBe("integration");
    expect(find("webhook")).toBe("integration");
    expect(find("transfer")).toBe("action");
    expect(find("assign_agent")).toBe("action");
    expect(find("tag")).toBe("action");
    expect(find("end")).toBe("system");
  });

  it("nenhum kind técnico é exposto como rótulo visível", () => {
    for (const g of grouped) {
      for (const b of g.blocks) {
        // meta.label é humano; kind técnico nunca deve virar título.
        expect(b.meta.label).not.toBe(b.kind);
      }
    }
  });
});
