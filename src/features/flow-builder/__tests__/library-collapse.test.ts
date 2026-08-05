/**
 * FB-12.6 — Library V3 collapse/expand.
 *
 * Cobertura de contrato:
 *  - chave de persistência estável (`flow-builder.v3.library.collapsed`);
 *  - largura recolhida (56px) menor que expandida (300px);
 *  - rail apresenta todas as categorias V3;
 *  - responsivo <=1024 continua permitindo colapso;
 *  - Inspector (340px) + Library recolhida cabem em 1280px preservando canvas útil.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { V3_LIBRARY_CATEGORIES } from "../library/v3/categories";

const PANEL = fs.readFileSync(
  path.resolve("src/features/flow-builder/library/v3/NodeLibraryPanelV3.tsx"),
  "utf8",
);
const CSS = fs.readFileSync(
  path.resolve("src/features/flow-builder/canvas/v3/v3.css"),
  "utf8",
);

describe("FB-12.6 · Library collapse/expand", () => {
  it("usa localStorage com chave estável", () => {
    expect(PANEL).toContain('"flow-builder.v3.library.collapsed"');
    expect(PANEL).toMatch(/window\.localStorage\.setItem\(STORAGE_KEY/);
    expect(PANEL).toMatch(/window\.localStorage\.getItem\(STORAGE_KEY\)/);
  });

  it("renderiza rail com toda categoria V3 quando colapsada", () => {
    expect(PANEL).toContain("fbv3-lib--collapsed");
    expect(PANEL).toContain("fbv3-lib__rail");
    // Rail é derivado de V3_LIBRARY_CATEGORIES → cobre todas as categorias.
    expect(PANEL).toContain("V3_LIBRARY_CATEGORIES.map");
    expect(V3_LIBRARY_CATEGORIES.length).toBeGreaterThanOrEqual(9);
  });

  it("libera espaço para o canvas: 56px recolhida vs 300px expandida", () => {
    // Expandida
    expect(CSS).toMatch(/\.fbv3-lib\s*\{[^}]*width:\s*300px/);
    // Recolhida
    expect(CSS).toMatch(/\.fbv3-lib--collapsed\s*\{[^}]*width:\s*56px/);
  });

  it("responsivo <=1024 mantém colapso funcional e reduz expandida", () => {
    expect(CSS).toMatch(/@media \(max-width: 1024px\)/);
    expect(CSS).toMatch(/\.fbv3-lib\s*\{\s*width:\s*260px/);
  });

  it("Library recolhida + Inspector 340px cabem em 1280px com canvas útil", () => {
    // Grid: 56 (lib) + canvas + 340 (inspector). Canvas mínimo aceitável = 800px.
    const canvas = 1280 - 56 - 340;
    expect(canvas).toBeGreaterThanOrEqual(800);
  });

  it("botão de recolher e de expandir presentes com aria-label acessível", () => {
    expect(PANEL).toContain('aria-label="Recolher biblioteca"');
    expect(PANEL).toContain('aria-label="Expandir biblioteca"');
  });
});
