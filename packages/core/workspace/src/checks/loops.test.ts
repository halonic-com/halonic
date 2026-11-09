import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { findLoops } from "./loops.ts";

/** A graph from a plain map; a name without an entry names nothing. */
function graph(edges: Record<string, string[]>): (id: string) => string[] {
  return (id) => edges[id] ?? [];
}

verifies("workspace.file-rules", () => {
  it("gives a loop once, from its first item", () => {
    const next = graph({ a: ["b"], b: ["c"], c: ["a"] });
    expect(findLoops(["a", "b", "c"], next)).toEqual([["a", "b", "c", "a"]]);
  });

  it("starts the loop at the first item that is in it, not at one that leads to it", () => {
    // "batch" runs "check", which runs "extra", which runs "check" again.
    const next = graph({ batch: ["check"], check: ["extra"], extra: ["check"] });
    expect(findLoops(["batch", "extra", "check"], next)).toEqual([["extra", "check", "extra"]]);
  });

  it("gives two separate loops, and leaves out items that name themselves or unknown items", () => {
    const next = graph({ a: ["a", "ghost", "b"], b: ["a"], c: ["d"], d: ["c"], e: ["a"] });
    expect(findLoops(["a", "b", "c", "d", "e"], next)).toEqual([
      ["a", "b", "a"],
      ["c", "d", "c"],
    ]);
  });

  it("visits an item once while it looks for the way back", () => {
    // From "a", both "b" and "c" lead to "d", which leads nowhere back to "a".
    const next = graph({ a: ["b", "c"], b: ["d"], c: ["d"], d: [] });
    expect(findLoops(["a", "b", "c", "d"], next)).toEqual([]);
  });
});
