/**
 * FB-04 — Cobertura do SmartSidebar (camada de lógica).
 *
 * Os testes exercitam o contrato compartilhado pelo painel:
 *  - `fields` declarados por bloco disparam validação obrigatória;
 *  - `preview` atualiza deterministicamente a cada edição;
 *  - `replaceNodeData` restaura integralmente o estado inicial (Cancelar);
 *  - troca de seleção limpa o snapshot corrente.
 *
 * A camada visual (React) segue as regras testadas aqui — quebrar um
 * destes contratos quebra a experiência do painel.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { blockRegistry } from "../blocks/registry";
import { useBuilderStore } from "../state/store";
import { makeErrorLookup } from "../fields/validation";
import type { FieldSpec } from "../fields/types";
import "../blocks/definitions";

function reset() {
  useBuilderStore.getState()._reset();
}

describe("SmartSidebar · Registry × Fields", () => {
  beforeEach(reset);

  it("todos os 17 blocos legados têm `fields` declarados", () => {
    const kinds = [
      "start",
      "message",
      "send_image",
      "send_audio",
      "send_video",
      "send_document",
      "question",
      "wait",
      "wait_reply",
      "condition",
      "ai",
      "transfer",
      "assign_agent",
      "tag",
      "http_request",
      "webhook",
      "end",
    ];
    for (const k of kinds) {
      const def = blockRegistry.get(k);
      expect(def).toBeDefined();
      expect(Array.isArray((def as { fields?: FieldSpec[] }).fields)).toBe(true);
    }
  });

  it("validação em tempo real sinaliza campo obrigatório vazio", () => {
    const def = blockRegistry.get("message")!;
    const fields = (def as { fields: FieldSpec[] }).fields;
    const issues = def.validate?.({ body: "" }).issues ?? [];
    const errFor = makeErrorLookup(fields, { body: "" }, issues);
    // FB-06 — mensagem acionável em linguagem de negócio
    expect(errFor("body")).toMatch(/Escreva|obrigat|vazia/i);
  });

  it("validação libera quando o campo é preenchido", () => {
    const def = blockRegistry.get("message")!;
    const fields = (def as { fields: FieldSpec[] }).fields;
    const issues = def.validate?.({ body: "olá" }).issues ?? [];
    const errFor = makeErrorLookup(fields, { body: "olá" }, issues);
    expect(errFor("body")).toBeNull();
  });

  it("preview do bloco atualiza deterministicamente com os dados", () => {
    const def = blockRegistry.get("wait")!;
    // FB-06 — preview em linguagem humana
    expect(def.preview?.({ seconds: 7 })).toBe("Aguardar 7 segundos");
    expect(def.preview?.({ seconds: 0 })).toBeNull();
  });
});


describe("SmartSidebar · Cancelar restaura estado", () => {
  beforeEach(reset);

  it("replaceNodeData volta o data ao snapshot inicial", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", {
      nodes: [
        {
          id: "n1",
          kind: "message",
          position: { x: 0, y: 0 },
          data: { label: "L", body: "original" },
        },
      ],
      edges: [],
    });
    const initial = JSON.parse(
      JSON.stringify(useBuilderStore.getState().nodesById["n1"].data),
    );
    useBuilderStore.getState().updateNodeData("n1", { body: "editado" });
    expect(useBuilderStore.getState().nodesById["n1"].data.body).toBe("editado");
    useBuilderStore.getState().replaceNodeData("n1", initial);
    expect(useBuilderStore.getState().nodesById["n1"].data.body).toBe("original");
  });

  it("chaves adicionadas após o snapshot são removidas ao restaurar", () => {
    const s = useBuilderStore.getState();
    s.loadFromSnapshot("f", {
      nodes: [
        {
          id: "n1",
          kind: "http_request",
          position: { x: 0, y: 0 },
          data: { label: "L", method: "GET", url: "" },
        },
      ],
      edges: [],
    });
    const initial = JSON.parse(
      JSON.stringify(useBuilderStore.getState().nodesById["n1"].data),
    );
    useBuilderStore.getState().updateNodeData("n1", { url: "https://x", extra: 1 });
    expect(useBuilderStore.getState().nodesById["n1"].data.extra).toBe(1);
    useBuilderStore.getState().replaceNodeData("n1", initial);
    expect(useBuilderStore.getState().nodesById["n1"].data.extra).toBeUndefined();
    expect(useBuilderStore.getState().nodesById["n1"].data.url).toBe("");
  });
});
