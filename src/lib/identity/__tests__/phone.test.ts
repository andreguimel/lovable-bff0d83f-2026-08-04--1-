import { describe, expect, it } from "vitest";
import { isSamePhone, toE164 } from "../phone";

describe("toE164 — normalização canônica BR-aware", () => {
  const CANON = "+5511999998888";

  it.each([
    "+5511999998888",
    "5511999998888",
    "55 11 99999-8888",
    "+55 (11) 99999-8888",
    "(11) 99999-8888",
    "11999998888",
    "11 9 9999 8888",
  ])("normaliza %s para o mesmo canônico", (input) => {
    expect(toE164(input)).toBe(CANON);
  });

  it("números BR fixos (10 dígitos) recebem +55", () => {
    expect(toE164("(11) 3333-4444")).toBe("+551133334444");
  });

  it("recusa entradas vazias ou apenas separadores", () => {
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164("+++")).toBeNull();
    expect(toE164("()-")).toBeNull();
  });

  it("recusa DDDs BR inválidos", () => {
    expect(toE164("(01) 99999-8888")).toBeNull();
    expect(toE164("09 99999 8888")).toBeNull();
  });

  it("recusa números BR insuficientes (evita merge acidental)", () => {
    expect(toE164("99998888")).toBeNull(); // 8 dígitos sem contexto BR
    expect(toE164("999998888")).toBeNull(); // 9 dígitos, ambíguo
  });

  it("recusa números que começam com 0 (linha nacional)", () => {
    expect(toE164("+0 11 99999")).toBeNull();
    expect(toE164("0 21 99999-8888")).toBeNull();
  });

  it("aceita internacional apenas com prefixo '+' explícito", () => {
    expect(toE164("+14155551234")).toBe("+14155551234");
    expect(toE164("+442071234567")).toBe("+442071234567");
  });

  it("sequência 11-dígitos com DDD BR válido é interpretada como BR (produto BR-first)", () => {
    // Sem '+' explícito, "14155551234" bate DDD 14 (SP interior) — BR-first vence.
    expect(toE164("14155551234")).toBe("+5514155551234");
  });

  it("aceita internacional 12-15 dígitos sem '+' quando não bate padrão BR", () => {
    expect(toE164("442071234567")).toBe("+442071234567"); // 12 dígitos, não é DDI 55
  });

  it("preserva DDI já presente em BR com espaços", () => {
    expect(toE164("55 21 91234-5678")).toBe("+5521912345678");
  });

  it("isSamePhone é verdadeiro entre variantes do mesmo canônico", () => {
    expect(isSamePhone("(11) 99999-8888", "+5511999998888")).toBe(true);
    expect(isSamePhone("55 11 99999-8888", "11999998888")).toBe(true);
  });

  it("isSamePhone é falso quando qualquer lado é ambíguo", () => {
    expect(isSamePhone("99998888", "99998888")).toBe(false); // ambos ambíguos
    expect(isSamePhone("(11) 99999-8888", "99998888")).toBe(false);
  });
});
