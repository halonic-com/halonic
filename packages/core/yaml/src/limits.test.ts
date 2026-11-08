import { describe, expect, it } from "vitest";
import { defaultYamlLimits, readYaml } from "./read.ts";

/** `depth` lists inside each other, written flow style: `[[[]]]`. */
const nestedLists = (depth: number) => "[".repeat(depth) + "]".repeat(depth);

/** `depth` maps inside each other, written block style. */
const nestedMaps = (depth: number) =>
  Array.from({ length: depth }, (_, level) => `${"  ".repeat(level)}k:`).join("\n");

describe("yaml.read-limits", () => {
  it("allows 100 levels of nesting by default", () => {
    expect(defaultYamlLimits.maxDepth).toBe(100);
    expect(readYaml(nestedLists(100)).ok).toBe(true);
    expect(readYaml(nestedMaps(100)).ok).toBe(true);
  });

  it("rejects one level more, at the first list or map past the limit", () => {
    expect(readYaml(nestedLists(101))).toEqual({
      ok: false,
      error: {
        kind: "too-deep",
        message:
          "Lists and maps nest more than 100 levels deep. Workspace files never need that many; look for a runaway structure.",
        line: 1,
        col: 101,
      },
    });
    expect(readYaml(nestedMaps(101))).toMatchObject({
      ok: false,
      error: { kind: "too-deep", line: 101 },
    });
  });

  it("takes a smaller depth limit", () => {
    const limits = { ...defaultYamlLimits, maxDepth: 2 };
    expect(readYaml("a:\n  b: 1\n", limits).ok).toBe(true);
    expect(readYaml("a:\n  b:\n    c: 1\n", limits)).toMatchObject({
      ok: false,
      error: { kind: "too-deep", line: 3 },
    });
  });

  it("rejects very deep nesting with the same problem, also where the yaml library runs out of stack", () => {
    // `- - - x` nests block lists on one line.
    for (const text of [nestedLists(200_000), `${"- ".repeat(5_000)}x`]) {
      expect(readYaml(text)).toMatchObject({
        ok: false,
        error: {
          kind: "too-deep",
          message: expect.stringMatching(/^Lists and maps nest more than 100 levels/),
        },
      });
    }
  });

  it("rejects a text longer than the length limit before parsing it", () => {
    const limits = { ...defaultYamlLimits, maxLength: 10 };
    expect(readYaml("a: 1234567", limits).ok).toBe(true);
    expect(readYaml("a: 12345678", limits)).toEqual({
      ok: false,
      error: {
        kind: "too-large",
        message: "The file is 11 characters long; the limit is 10.",
        line: 1,
        col: 1,
      },
    });
  });
});
