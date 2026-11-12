import { describe, expect, it } from "vitest";
import { missingShimApis } from "./matcher-check.ts";

describe("missingShimApis", () => {
  it("is empty for matchers the shim has and for JavaScript's own to… methods", () => {
    const source = [
      "expect(clock.now().toISOString()).toBe(name.toLowerCase());",
      "expect(value).not.toBeNull();",
      "expect(String(1).toUpperCase()).toBeUndefined();",
      "context.expect.getState(); expect.setState({ assertionCalls: 1 });",
    ].join("\n");
    expect(missingShimApis(source)).toEqual([]);
  });

  it("names each missing matcher and expect helper once, sorted", () => {
    const source = [
      "expect(list).toHaveLength(2);",
      "expect(list).toEqual([expect.any(String)]);",
      "expect(other).toEqual([]);",
      "await expect(promise).rejects.toThrow();",
    ].join("\n");
    expect(missingShimApis(source)).toEqual([
      ".rejects",
      "expect.any",
      "toEqual",
      "toHaveLength",
      "toThrow",
    ]);
  });

  it("names .rejects and .resolves even before a matcher the shim has", () => {
    const source = [
      "await expect(store.get(key)).rejects.toBe(error);",
      "await expect(store.has(key)).resolves.toBe(true);",
    ].join("\n");
    expect(missingShimApis(source)).toEqual([".rejects", ".resolves"]);
  });
});
