import { describe, expect, it } from "vitest";
import * as shim from "./vitest-shim.ts";

describe("the vitest shim", () => {
  it("takes describe with and without options, and registers it and test alike", () => {
    shim.describe("plain", () => shim.it("one", () => {}));
    shim.describe("tagged", { meta: { requirement: "acme.tagged" } }, () =>
      shim.test("two", () => {}),
    );
    const names = shim.registry
      .tree()
      .children.map((node) => (node.kind === "suite" ? [node.name, node.meta] : []));
    expect(names).toEqual([
      ["plain", {}],
      ["tagged", { requirement: "acme.tagged" }],
    ]);
    expect(() => shim.describe("no body", {})).toThrow("has options but no body");
  });

  it("asserts a condition with Vitest's assert", () => {
    expect(() => shim.assert(true)).not.toThrow();
    expect(() => shim.assert(null, "no lease")).toThrow("no lease");
    expect(() => shim.assert(0)).toThrow("expected the condition to be true");
  });

  it("waits until the check stops throwing, and gives up after timeout / interval tries", async () => {
    let calls = 0;
    const value = await shim.vi.waitFor(
      () => {
        calls += 1;
        if (calls < 3) throw new Error("not yet");
        return "ready";
      },
      { interval: 1 },
    );
    expect(value).toBe("ready");
    let failures = 0;
    const neverReady = shim.vi.waitFor(
      () => {
        failures += 1;
        throw new Error(`still not ready (${failures})`);
      },
      { timeout: 4, interval: 1 },
    );
    await expect(neverReady).rejects.toThrow("still not ready (4)");
  });
});
