import { describe, expect, it } from "bun:test";

/**
 * FB-12.3 · Fit-view útil
 *
 * Contrato: o fit-view do canvas nunca deve reduzir os cards abaixo de um
 * limite legível. Cap definido em minZoom=0.55 com padding=0.35.
 *
 * Este teste é um snapshot de contrato: qualquer alteração acidental em
 * FlowCanvasV2.tsx que baixe o piso de zoom ou o padding será detectada.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CANVAS_PATH = resolve(
  __dirname,
  "..",
  "canvas",
  "FlowCanvasV2.tsx",
);

const source = readFileSync(CANVAS_PATH, "utf8");

describe("FB-12.3 · fit-view útil", () => {
  it("mantém minZoom=0.55 no botão Organizar", () => {
    expect(source).toMatch(/fitView\(\{\s*padding:\s*0\.35[\s\S]*?minZoom:\s*0\.55/);
  });

  it("mantém fitViewOptions do ReactFlow com padding=0.35 e minZoom=0.55", () => {
    expect(source).toMatch(/fitViewOptions=\{\{\s*padding:\s*0\.35[\s\S]*?minZoom:\s*0\.55/);
  });
});
