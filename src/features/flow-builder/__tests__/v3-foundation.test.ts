/**
 * FB-10.1 / FB-10.3 — Testes de fundação visual V3.
 *
 * FB-10.1 iniciou com start/end no visual V3.
 * FB-10.3 estendeu a linguagem visual V3 para todos os 17 kinds atuais.
 */
import { describe, expect, it } from "bun:test";
import {
  V3_KINDS,
  isV3Kind,
  resolveCategoryV3,
  displayTitle,
  displayKindLabel,
  displayHandleLabel,
} from "../canvas/v3/tokens";

const ALL_KINDS = [
  "start",
  "end",
  "message",
  "question",
  "menu",
  "action",
  "send_image",
  "send_audio",
  "send_video",
  "send_document",
  "wait",
  "wait_reply",
  "condition",
  "ai",
  "transfer",
  "assign_agent",
  "tag",
  "http_request",
  "webhook",
];

describe("FB-10.3 · V3 tokens", () => {
  it("todos os kinds atuais fazem parte do visual V3 (17 legados + menu + action + flow_connection + randomizer + transfer_number)", () => {
    expect(V3_KINDS.size).toBe(22);
    for (const k of ALL_KINDS) expect(isV3Kind(k)).toBe(true);
    expect(isV3Kind("action")).toBe(true);
  });

  it("kinds desconhecidos NÃO são V3 (salvaguarda)", () => {
    expect(isV3Kind("kind_novo_futuro")).toBe(false);
  });

  it("resolveCategoryV3 usa overrides por kind quando existirem", () => {
    expect(resolveCategoryV3("start", "system")).toBe("system");
    expect(resolveCategoryV3("end", "system")).toBe("system");
    expect(resolveCategoryV3("wait", "logic")).toBe("wait");
    expect(resolveCategoryV3("ai", "ai")).toBe("ai");
    expect(resolveCategoryV3("condition", "logic")).toBe("logic");
    expect(resolveCategoryV3("http_request", "integrations")).toBe("integration");
  });

  it("resolveCategoryV3 cai no BlockCategory quando não há override", () => {
    expect(resolveCategoryV3("message", "channels")).toBe("content");
    expect(resolveCategoryV3("send_image", "channels")).toBe("content");
    expect(resolveCategoryV3("kind_novo", "integrations")).toBe("integration");
    expect(resolveCategoryV3("kind_novo", "crm")).toBe("action");
  });

  it("displayTitle nunca expõe kind técnico para start/end", () => {
    expect(displayTitle("start", "Início")).toBe("Bloco Inicial");
    expect(displayTitle("end", "Encerrar")).toBe("Encerrar");
    expect(displayTitle("start", "Início", "Boas-vindas")).toBe("Boas-vindas");
    expect(displayTitle("message", "Enviar mensagem")).toBe("Enviar mensagem");
  });

  it("displayKindLabel humaniza TODOS os 17 kinds — nenhum vaza técnico", () => {
    for (const k of ALL_KINDS) {
      const out = displayKindLabel(k, "fallback");
      expect(out).not.toBe("fallback");
      expect(out).not.toMatch(/_/); // sem underscores técnicos
      expect(out.length).toBeGreaterThan(2);
    }
  });

  it("displayHandleLabel devolve 'Sim' e 'Não' em condition", () => {
    expect(displayHandleLabel("condition", "true")).toBe("Sim");
    expect(displayHandleLabel("condition", "false")).toBe("Não");
    // single-out default não gera rótulo — evita poluir a lateral
    expect(displayHandleLabel("message", "default")).toBeNull();
  });
});
