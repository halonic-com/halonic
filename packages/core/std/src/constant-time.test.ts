import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { constantTimeEqual } from "./constant-time.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);

verifies("std.constant-time-equal", () => {
  it("is true for the same bytes", () => {
    expect(constantTimeEqual(bytes(1, 2, 3), bytes(1, 2, 3))).toBe(true);
    expect(constantTimeEqual(bytes(), bytes())).toBe(true);
  });

  it("is false when any byte differs, first, middle or last", () => {
    expect(constantTimeEqual(bytes(9, 2, 3), bytes(1, 2, 3))).toBe(false);
    expect(constantTimeEqual(bytes(1, 9, 3), bytes(1, 2, 3))).toBe(false);
    expect(constantTimeEqual(bytes(1, 2, 9), bytes(1, 2, 3))).toBe(false);
  });

  it("is false for different lengths, even when one is a prefix of the other", () => {
    expect(constantTimeEqual(bytes(1, 2), bytes(1, 2, 3))).toBe(false);
    expect(constantTimeEqual(bytes(1, 2, 3), bytes())).toBe(false);
  });

  it("compares every byte instead of stopping at the first difference", () => {
    let reads = 0;
    const counting = new Proxy(bytes(0, 0, 0, 0), {
      get(target, property) {
        if (typeof property === "string" && /^\d+$/.test(property)) {
          reads++;
        }
        // The typed array itself as receiver: its getters refuse the proxy.
        return Reflect.get(target, property, target);
      },
    });
    constantTimeEqual(counting, bytes(1, 1, 1, 1));
    expect(reads).toBe(4);
  });
});
