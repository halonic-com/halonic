import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  base64urlOf32Bytes,
  fixedRandomBytes,
  wrongCountRandomBytes,
} from "./fixed-random.test-helper.ts";
import { createState, stateMatches } from "./state.ts";

verifies("google-sign-in.state", () => {
  it("makes a new 43-character state each time from the platform's randomness", () => {
    const first = createState();
    const second = createState();

    expect(first).toMatch(base64urlOf32Bytes);
    expect(second).toMatch(base64urlOf32Bytes);
    expect(second).not.toBe(first);
  });

  it("writes the random bytes as base64url", () => {
    const bytes = new Uint8Array(32).fill(0xff);

    expect(createState(fixedRandomBytes(bytes))).toBe(`${"_".repeat(42)}8`);
  });

  it("matches only the same state", () => {
    const expected = createState();
    const lastCharacter = expected.endsWith("A") ? "B" : "A";

    expect(stateMatches(expected, expected)).toBe(true);
    expect(stateMatches(expected, `${expected.slice(0, -1)}${lastCharacter}`)).toBe(false);
    expect(stateMatches(expected, expected.slice(0, -1))).toBe(false);
    expect(stateMatches(expected, `${expected}A`)).toBe(false);
    expect(stateMatches(expected, createState())).toBe(false);
  });

  it("never matches a missing or empty state", () => {
    const expected = createState();

    expect(stateMatches(expected, null)).toBe(false);
    expect(stateMatches(expected, undefined)).toBe(false);
    expect(stateMatches(expected, "")).toBe(false);
    expect(stateMatches("", "")).toBe(false);
  });

  it("refuses a random source that gives too few or too many bytes", () => {
    expect(() => createState(wrongCountRandomBytes(33))).toThrow(
      "gave 33 bytes, but a sign-in secret needs 32",
    );
    expect(() => createState(wrongCountRandomBytes(0))).toThrow("gave 0 bytes");
  });
});
