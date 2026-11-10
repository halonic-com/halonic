import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isSeq, parseDocument } from "yaml";
import { readYaml } from "./read.ts";
import { findUnsupported, tooDeepMessage } from "./unsupported.ts";

const contentsOf = (text: string) => parseDocument(text).contents;

verifies("yaml.read-unsupported", () => {
  it("finds nothing in a tree of plain lists and maps", () => {
    expect(findUnsupported(contentsOf("a: [1, { b: 2 }]\nc: text\n"), 10)).toBeUndefined();
  });

  it("flags a list or map that sits at the depth limit, and not one level above it", () => {
    const text = "[[[]]]";
    expect(findUnsupported(contentsOf(text), 3)).toBeUndefined();

    const found = findUnsupported(contentsOf(text), 2);
    expect(found).toMatchObject({ kind: "too-deep", message: tooDeepMessage(2) });
    // The third list, the innermost one: it is the one with two lists around it.
    expect(found?.node.range?.[0]).toBe(2);
    expect(isSeq(found?.node)).toBe(true);
  });

  it("counts depth through maps as well as lists", () => {
    const found = findUnsupported(contentsOf("top:\n  mid:\n    leaf: 1\n"), 1);
    expect(found).toMatchObject({ kind: "too-deep" });
    expect(found?.node.range?.[0]).toBe(7);
  });

  it("does not count scalars as a level", () => {
    expect(findUnsupported(contentsOf("a: 1\n"), 1)).toBeUndefined();
    expect(findUnsupported(contentsOf("a: 1\n"), 0)).toMatchObject({ kind: "too-deep" });
  });

  it("words the depth message with the limit it was given", () => {
    expect(tooDeepMessage(7)).toBe(
      "Lists and maps nest more than 7 levels deep. Workspace files never need that many; look for a runaway structure.",
    );
  });

  it("reports a nesting problem found by the tree walk with the line and column of the list", () => {
    // `readYaml` finds this one in the token pass; the walk must agree with it.
    expect(readYaml("[[[]]]", { maxDepth: 2, maxLength: 100 })).toMatchObject({
      ok: false,
      error: { kind: "too-deep", line: 1, col: 3 },
    });
  });
});
