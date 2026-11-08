import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deepClone } from "./deep-clone.ts";

verifies("std.deep-clone", () => {
  it("copies nested plain data so nothing is shared", () => {
    const original = { name: "run", steps: [{ id: "a", tags: ["x"] }], at: new Date(5) };
    const copy = deepClone(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.steps).not.toBe(original.steps);
    expect(copy.steps[0]).not.toBe(original.steps[0]);
    expect(copy.at).not.toBe(original.at);
    expect(copy.at.getTime()).toBe(5);
  });

  it("returns primitives as they are", () => {
    expect(deepClone(3)).toBe(3);
    expect(deepClone("x")).toBe("x");
    expect(deepClone(null)).toBe(null);
    expect(deepClone(undefined)).toBe(undefined);
  });

  it("matches structuredClone on run-event-like data", () => {
    const event = {
      seq: 3,
      type: "step.finished",
      data: { output: { text: "done", score: 0.5 }, missing: null, list: [1, "two", false] },
    };
    expect(deepClone(event)).toEqual(structuredClone(event));
  });

  it("keeps shared and circular references the way structuredClone does", () => {
    const shared = { id: "s" };
    const original: Record<string, unknown> = { first: shared, second: shared };
    original["self"] = original;
    const copy = deepClone(original);
    expect(copy["first"]).toBe(copy["second"]);
    expect(copy["first"]).not.toBe(shared);
    expect(copy["self"]).toBe(copy);
  });

  it("keeps a '__proto__' key from JSON as a plain key", () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}}');
    const copy = deepClone(parsed);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(Object.keys(copy)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("keeps objects without a prototype without one", () => {
    const bare = Object.create(null);
    bare.a = 1;
    const copy = deepClone(bare);
    expect(Object.getPrototypeOf(copy)).toBe(null);
    expect(copy.a).toBe(1);
  });

  it("refuses what isn't plain data, and says where it is", () => {
    expect(() => deepClone({ run: { onDone: () => 1 } })).toThrow(
      "deepClone can't copy the function at value.run.onDone.",
    );
    expect(() => deepClone([Symbol("x")])).toThrow("can't copy the symbol at value[0]");
    expect(() => deepClone({ seen: new Map() })).toThrow(
      "deepClone copies plain data only, but value.seen is a Map.",
    );
    class Step {}
    expect(() => deepClone(new Step())).toThrow(/is a Step/);
  });
});
