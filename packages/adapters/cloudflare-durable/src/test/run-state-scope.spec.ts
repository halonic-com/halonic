// A run object notes the scope of its first write (see `run-state.test.ts`).

import { started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { newState } from "./run-state-case.ts";
import { inObjectState } from "./state-host.ts";

export { StateHostObject } from "./state-host.ts";

describe("RunState name prefix", () => {
  it("notes the prefix of the first append", () =>
    inObjectState(async ({ storage }) => {
      const { state } = newState(storage);
      await state.append("r1", 0, [started("r1")], {}, "u/acme/");
      expect(await state.namePrefix()).toBe("u/acme/");
    }));

  it("notes the prefix of a first schedule, and takes the same prefix again", () =>
    inObjectState(async ({ storage }) => {
      const { state, inMs } = newState(storage);
      await state.schedule("r1", "wait", inMs(1000), "o/acme/");
      await state.append("r1", 0, [started("r1")], {}, "o/acme/");
      expect(await state.namePrefix()).toBe("o/acme/");
    }));

  it("refuses a write under another prefix and stores none of it", () =>
    inObjectState(async ({ storage }) => {
      const { state, inMs } = newState(storage);
      await state.append("r1", 0, [started("r1")], {}, "u/acme/");
      await expect(state.append("r1", 1, [], {}, "o/acme/")).rejects.toThrow(RangeError);
      await expect(state.schedule("r1", "wait", inMs(1000), "")).rejects.toThrow(RangeError);
      expect(await state.pending("r1")).toEqual([]);
      expect(await state.namePrefix()).toBe("u/acme/");
    }));

  it("notes an empty prefix for an unscoped write", () =>
    inObjectState(async ({ storage }) => {
      const { state } = newState(storage);
      await state.append("r1", 0, [started("r1")]);
      expect(await state.namePrefix()).toBe("");
    }));
});
