import { describe, expect, it } from "vitest";
import { extractTextAndLinks } from "../linkified-text";

describe("extractTextAndLinks", () => {
  it("returns empty array for null or empty text", () => {
    expect(extractTextAndLinks(null)).toEqual([]);
    expect(extractTextAndLinks("")).toEqual([]);
  });

  it("returns plain text without links when no URL is present", () => {
    expect(extractTextAndLinks("Olá, tudo bem?")).toEqual([
      { type: "text", content: "Olá, tudo bem?" },
    ]);
  });

  it("extracts http and https URLs", () => {
    const parts = extractTextAndLinks("Acesse https://zenda.app e http://example.com para saber mais.");
    expect(parts).toEqual([
      { type: "text", content: "Acesse " },
      { type: "link", content: "https://zenda.app", href: "https://zenda.app" },
      { type: "text", content: " e " },
      { type: "link", content: "http://example.com", href: "http://example.com" },
      { type: "text", content: " para saber mais." },
    ]);
  });

  it("converts www. URLs to https links", () => {
    const parts = extractTextAndLinks("Visite www.google.com para buscas.");
    expect(parts).toEqual([
      { type: "text", content: "Visite " },
      { type: "link", content: "www.google.com", href: "https://www.google.com" },
      { type: "text", content: " para buscas." },
    ]);
  });

  it("strips trailing punctuation from URL", () => {
    const parts = extractTextAndLinks("Confira: https://zenda.app/demo.");
    expect(parts).toEqual([
      { type: "text", content: "Confira: " },
      { type: "link", content: "https://zenda.app/demo", href: "https://zenda.app/demo" },
      { type: "text", content: "." },
    ]);
  });

  it("preserves line breaks in text parts", () => {
    const parts = extractTextAndLinks("Linha 1\nhttps://zenda.app\nLinha 3");
    expect(parts).toEqual([
      { type: "text", content: "Linha 1\n" },
      { type: "link", content: "https://zenda.app", href: "https://zenda.app" },
      { type: "text", content: "\nLinha 3" },
    ]);
  });
});
