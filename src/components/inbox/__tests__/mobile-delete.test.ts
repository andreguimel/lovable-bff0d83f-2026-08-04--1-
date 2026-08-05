/**
 * Fase 4 (Mobile) — smoke tests for the mobile inbox delete surface.
 * Pure module import; the sheet + selection bar are React components
 * whose deeper behaviour is validated end-to-end via manual QA and the
 * shared `message-delete.functions` contract test.
 */
import { describe, it, expect } from "bun:test";
import { MobileMessageActionsSheet } from "../mobile/mobile-message-actions-sheet";
import { MobileSelectionBar } from "../mobile/mobile-selection-bar";

describe("inbox mobile delete surface", () => {
  it("exports the actions sheet component", () => {
    expect(typeof MobileMessageActionsSheet).toBe("function");
  });
  it("exports the selection bar component", () => {
    expect(typeof MobileSelectionBar).toBe("function");
  });
});
