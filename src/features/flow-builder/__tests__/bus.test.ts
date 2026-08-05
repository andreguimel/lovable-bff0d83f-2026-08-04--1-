import { describe, it, expect } from "bun:test";
import { builderBus } from "../events/bus";

describe("flow-builder event bus", () => {
  it("emite apenas para o tipo assinado", () => {
    const got: string[] = [];
    const off1 = builderBus.on("node:added", (e) => got.push(`added:${e.nodeId}`));
    const off2 = builderBus.on("node:removed", (e) => got.push(`removed:${e.nodeId}`));

    builderBus.emit({ type: "node:added", nodeId: "n1", kind: "message" });
    builderBus.emit({ type: "node:removed", nodeId: "n1" });

    expect(got).toEqual(["added:n1", "removed:n1"]);
    off1();
    off2();
  });

  it("onAny recebe todos os eventos", () => {
    const seen: string[] = [];
    const off = builderBus.onAny((e) => seen.push(e.type));
    builderBus.emit({ type: "flow:save-requested" });
    builderBus.emit({ type: "inspector:closed" });
    expect(seen).toEqual(["flow:save-requested", "inspector:closed"]);
    off();
  });
});
