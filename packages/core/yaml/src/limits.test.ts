import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
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

  it("rejects a file under the length limit that would use up memory, without building its tree", () => {
    // Five million `[` is what used to exhaust the heap in the yaml library.
    const limits = { ...defaultYamlLimits, maxLength: 10_000_000 };
    for (const text of ["[".repeat(5_000_000), "- ".repeat(2_000_000), "{a: ".repeat(2_000_000)]) {
      expect(readYaml(text, limits)).toMatchObject({ ok: false, error: { kind: "too-deep" } });
    }
  });

  it("puts a too-deep problem at the first list or map past the limit, not at the end", () => {
    const text = `${nestedMaps(100)}\n${"  ".repeat(100)}k:\n${"  ".repeat(101)}k:\n${"  ".repeat(102)}k: 1\n`;
    expect(readYaml(text)).toMatchObject({
      ok: false,
      error: { kind: "too-deep", line: 101, col: 201 },
    });
  });

  it("counts every layout the same way as the tree does", () => {
    // Nested lists and maps, in block and flow style, on both sides of the limit.
    for (const depth of [1, 2, 3, 10, 30]) {
      let value: unknown = 1;
      for (let level = 0; level < depth; level++) {
        value = level % 2 === 0 ? { key: value, other: 1 } : [value, "x"];
      }
      for (const text of [stringify(value), stringify(value, { collectionStyle: "flow" })]) {
        expect(readYaml(text, { ...defaultYamlLimits, maxDepth: depth }).ok).toBe(true);
        expect(readYaml(text, { ...defaultYamlLimits, maxDepth: depth - 1 })).toMatchObject({
          ok: false,
          error: { kind: "too-deep" },
        });
      }
    }
  });

  it("counts a list written at the same indent as its key, and several levels on one line", () => {
    expect(readYaml("a:\n- b:\n  - c\nd: 1\n", { ...defaultYamlLimits, maxDepth: 4 }).ok).toBe(
      true,
    );
    expect(readYaml("a:\n- b:\n  - c\n", { ...defaultYamlLimits, maxDepth: 3 }).ok).toBe(false);
    expect(readYaml("- - - x\n- y\n", { ...defaultYamlLimits, maxDepth: 3 }).ok).toBe(true);
    expect(readYaml("- - - x\n", { ...defaultYamlLimits, maxDepth: 2 }).ok).toBe(false);
    expect(readYaml("k: |\n  [[[[\n  - - -\n", { ...defaultYamlLimits, maxDepth: 1 }).ok).toBe(
      true,
    );
  });

  it("fails cleanly on a billion-laughs file, because it uses aliases", () => {
    const lines = ["a: &a [x, x, x, x, x, x, x, x, x]"];
    for (const [name, previous] of [
      ["b", "a"],
      ["c", "b"],
      ["d", "c"],
      ["e", "d"],
      ["f", "e"],
      ["g", "f"],
      ["h", "g"],
      ["i", "h"],
    ] as const) {
      lines.push(`${name}: &${name} [${Array(9).fill(`*${previous}`).join(", ")}]`);
    }
    expect(readYaml(`${lines.join("\n")}\n`)).toMatchObject({
      ok: false,
      error: { kind: "unsupported", message: expect.stringMatching(/^Anchors/) },
    });
    expect(readYaml("a: [x]\nb: [*a, *a]\n")).toMatchObject({
      ok: false,
      error: { kind: "unsupported", message: expect.stringMatching(/^Aliases/) },
    });
  });
});
