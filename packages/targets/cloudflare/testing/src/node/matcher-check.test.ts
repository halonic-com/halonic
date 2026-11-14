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
      "expect(list).toBeTruthy();",
      "expect(list).toEqual([expect.any(String)]);",
      "expect(other).toEqual([]);",
      "await expect(promise).rejects.toThrow();",
      "expect(spy).toHaveBeenCalled();",
    ].join("\n");
    expect(missingShimApis(source)).toEqual(["expect.any", "toBeTruthy", "toHaveBeenCalled"]);
  });

  it("names .resolves even before a matcher the shim has, and allows .rejects", () => {
    const source = [
      "await expect(store.get(key)).rejects.toBe(error);",
      "await expect(store.has(key)).resolves.toBe(true);",
    ].join("\n");
    expect(missingShimApis(source)).toEqual([".resolves"]);
  });

  it("names it, test, describe and vi properties the shim lacks, and allows vi.waitFor", () => {
    const source = [
      'it.each([1, 2])("case %s", (value) => {});',
      'it.fails("breaks", () => {});',
      'describe.skip("later", () => {});',
      "const spy = vi.fn(); await vi.waitFor(() => spy());",
      'test.todo("someday");',
    ].join("\n");
    expect(missingShimApis(source)).toEqual([
      "describe.skip",
      "it.each",
      "it.fails",
      "test.todo",
      "vi.fn",
    ]);
  });

  it("ignores the same names after a dot, such as a regular expression's test", () => {
    const source = ["const ok = /x/.test(name);", "context.it.each;", "suite.describe.skip;"].join(
      "\n",
    );
    expect(missingShimApis(source)).toEqual([]);
  });
});
