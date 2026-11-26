import { toolScriptDefaultLimits } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { fenceIt, leavesOut, leavingOut } from "./fence-case.ts";
import type { MakeToolScriptIsolate } from "./harness.ts";

/** A suite's own `make`; it is never called here. */
function makeNothing(): MakeToolScriptIsolate {
  return () => ({
    limits: toolScriptDefaultLimits.agent,
    run: async () => {
      throw new Error("Not called.");
    },
  });
}

describe("a fence suite that leaves a case out", () => {
  const make = makeNothing();
  leavingOut(make, { "acme case": "calls a host function" });
  fenceIt(make)("acme case", () => {
    throw new Error("A left-out case is never registered.");
  });

  it("registers no left-out case, and every other case as before", () => {
    expect(leavesOut(make, "acme case")).toBe(true);
    expect(leavesOut(make, "another case")).toBe(false);
    expect(leavesOut(makeNothing(), "acme case")).toBe(false);
  });

  it("refuses a case left out without a reason", () => {
    expect(() => leavingOut(makeNothing(), { "acme case": " " })).toThrow(
      "Say why each fence case is left out: acme case.",
    );
  });
});
