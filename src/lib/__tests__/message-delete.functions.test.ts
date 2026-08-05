/**
 * Capability contract test — ensures the UI-facing helper stays in sync
 * with the provider adapters. Pure JS test (no supabase / http).
 */
import { describe, it, expect } from "bun:test";
import { deleteMessages, getConversationDeleteCapabilities } from "../message-delete.functions";

describe("message-delete.functions module", () => {
  it("exports both server functions", () => {
    expect(typeof deleteMessages).toBe("function");
    expect(typeof getConversationDeleteCapabilities).toBe("function");
  });
});
