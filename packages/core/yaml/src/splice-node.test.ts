import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { Document, parseDocument, Scalar, YAMLMap } from "yaml";
import {
  addPair,
  deleteEntry,
  insertItem,
  nodeAt,
  type Parsed,
  parse,
  replaceFlow,
  replaceScalar,
  replaceValue,
} from "./splice-node.ts";

// The primitive splices, checked on the node level so each rule of the layout
// handling is pinned down on its own. They return `undefined` for a layout
// they don't handle, which is what the caller's fallback relies on.

const lines = (...rows: string[]) => `${rows.join("\n")}\n`;

const valueNode = (text: string, key: string) =>
  (parse(text).document.contents as YAMLMap).items.find((pair) => String(pair.key) === key)?.value;

// A parse without source tokens, as a caller could build one by hand.
const withoutTokens = (text: string): Parsed => ({
  text,
  document: parseDocument(text),
  style: { indent: 2, indentSeq: true },
});

verifies("yaml.edit", () => {
  it("takes the indent style from the first block map and list under a key", () => {
    expect(parse("a: 1\n").style).toEqual({ indent: 2, indentSeq: true });
    expect(parse(lines("a:", "    b: 1")).style).toEqual({ indent: 4, indentSeq: true });
    expect(parse(lines("a:", "  - x")).style).toEqual({ indent: 2, indentSeq: true });
    expect(parse(lines("a:", "- x")).style).toEqual({ indent: 2, indentSeq: false });
    expect(parse(lines("a:", "    - x")).style).toEqual({ indent: 4, indentSeq: true });
    expect(parse(lines("a:", "  - x", "b:", "    c: 1")).style).toEqual({
      indent: 4,
      indentSeq: false,
    });
    expect(parse(lines("a:", "    b: 1", "c:", "  - x")).style).toEqual({
      indent: 4,
      indentSeq: false,
    });
  });

  it("looks for the indent inside the items of a list and skips plain items", () => {
    expect(parse(lines("- a:", "      b: 1")).style).toEqual({ indent: 4, indentSeq: true });
    expect(parse(lines("- x", "- a:", "      b: 1")).style).toEqual({
      indent: 4,
      indentSeq: true,
    });
  });

  it("takes no indent from a collection in flow style", () => {
    expect(parse(lines("a: {", "    b: 1", "  }")).style).toEqual({ indent: 2, indentSeq: true });
    expect(parse("a: {b: 1}\n").style).toEqual({ indent: 2, indentSeq: true });
    expect(parse("a: [b, c]\n").style).toEqual({ indent: 2, indentSeq: true });
  });

  it("finds nothing at a key that isn't there, in a scalar or at a text index", () => {
    expect(nodeAt(parse("a: 1\n"), ["a", 0])).toBeUndefined();
    expect(nodeAt(parse("- a\n"), ["0"])).toBeUndefined();
    expect(nodeAt(parse("- a\n"), [3])).toBeUndefined();
    expect(nodeAt(parse("a: 1\n"), ["z"])).toBeUndefined();
  });

  it("rewrites a one-line flow collection only when it fits on that line", () => {
    const text = "k: [ a ]\n";
    expect(replaceFlow(parse(text), valueNode(text, "k") as YAMLMap, [1])).toBe("k: [ 1 ]\n");
    expect(replaceFlow(parse(text), valueNode(text, "k") as YAMLMap, ["x\ny"])).toBeUndefined();
    expect(
      replaceFlow(parse("x [a]\n"), { range: [0, 5, 5] } as unknown as YAMLMap, [1]),
    ).toBeUndefined();
    expect(replaceFlow(parse(text), { range: null } as unknown as YAMLMap, [1])).toBeUndefined();
    const multi = lines("k: [", "  a", "]");
    expect(replaceFlow(parse(multi), valueNode(multi, "k") as YAMLMap, [1])).toBeUndefined();
  });

  it("replaces a value only where a key or an item holds one", () => {
    expect(replaceValue(parse("a: 1\n"), ["z"], 2)).toBeUndefined();
    expect(replaceValue(parse("a: 1\n"), ["x", "y"], 2)).toBeUndefined();
    expect(replaceValue(parse("a: 1\n"), ["x", 0], 2)).toBeUndefined();
    expect(replaceValue(parse("a: 1\n"), ["a", "y"], 2)).toBeUndefined();
    expect(replaceValue(parse("- a\n"), [5], 2)).toBeUndefined();
    expect(replaceValue(parse("k: [a, b]\n"), ["k", 0], 2)).toBeUndefined();
    expect(replaceValue(withoutTokens("- a\n"), [0], 2)).toBeUndefined();
  });

  it("replaces the empty value of a key and an empty item", () => {
    expect(replaceValue(parse(lines("a:", "b: 1")), ["a"], "z")).toBe(lines("a: z", "b: 1"));
    expect(replaceValue(parse(lines("-", "- a")), [0], "z")).toBe(lines("- z", "- a"));
  });

  it("replaces the characters of a scalar and nothing else", () => {
    const text = "a: 'x' # c\n";
    expect(replaceScalar(parse(text), valueNode(text, "a") as Scalar, "y")).toBe("a: 'y' # c\n");
    expect(
      replaceScalar(parse(text), parse(text).document.contents as YAMLMap, "y"),
    ).toBeUndefined();
    expect(replaceScalar(parse(text), new Scalar("x"), "y")).toBeUndefined();
  });

  it("gives up on an empty value and a text that spans lines", () => {
    const empty = lines("a:", "b: 1");
    expect(replaceScalar(parse(empty), valueNode(empty, "a") as Scalar, "z")).toBeUndefined();
    const multi = lines("a: |", "  x", "  y");
    expect(replaceScalar(parse(multi), valueNode(multi, "a") as Scalar, "z")).toBeUndefined();
  });

  it("adds a pair only to a block map, or to an empty flow map", () => {
    expect(addPair(parse("- a\n"), [], "k", 1)).toBeUndefined();
    expect(addPair(parse("m: {a: 1}\n"), ["m"], "k", 2)).toBeUndefined();
    expect(addPair(parse("m: {}\n"), ["m"], "k", 2)).toBe(lines("m:", "  k: 2"));
    const empty = new Document();
    empty.contents = new YAMLMap();
    expect(
      addPair({ text: "", document: empty, style: { indent: 2, indentSeq: true } }, [], "k", 1),
    ).toBeUndefined();
  });

  it("inserts an item only into a block list, or an empty flow list", () => {
    expect(insertItem(parse("a: 1\n"), ["a"], 0, 1)).toBeUndefined();
    expect(insertItem(parse("k: [a]\n"), ["k"], 0, "z")).toBeUndefined();
    expect(insertItem(parse("m: []\n"), ["m"], 0, 2)).toBe(lines("m:", "  - 2"));
    expect(insertItem(parse(lines("-", "- a")), [], 2, "z")).toBe(lines("-", "- a", "- z"));
    expect(insertItem(parse(lines("-", "- a")), [], 0, "z")).toBe(lines("- z", "-", "- a"));
    expect(insertItem(parse(lines("- - a", "  - b")), [0], 0, "z")).toBe(
      lines("- - z", "  - a", "  - b"),
    );
  });

  it("deletes only an entry of a block collection", () => {
    expect(deleteEntry(parse("a: 1\n"), ["a", "b"])).toBeUndefined();
    expect(deleteEntry(parse("a: 1\n"), ["x", "y"])).toBeUndefined();
    expect(deleteEntry(parse("k: {a: 1, b: 2}\n"), ["k", "a"])).toBeUndefined();
    expect(deleteEntry(parse("k: [a, b]\n"), ["k", 0])).toBeUndefined();
    expect(deleteEntry(parse(lines("a: 1", "b: 2")), ["z"])).toBeUndefined();
    expect(deleteEntry(parse(lines("- a", "- b")), [5])).toBeUndefined();
    expect(deleteEntry(parse("a: 1\n"), ["z"])).toBeUndefined();
  });

  it("moves the next entry up when the first one of a `- ` line goes", () => {
    expect(deleteEntry(parse(lines("- a: 1", "  b: 2")), [0, "a"])).toBe(lines("- b: 2"));
    expect(deleteEntry(parse(lines("- - a", "  - b")), [0, 0])).toBe(lines("- - b"));
    expect(deleteEntry(parse(lines("- a: 1", "  # c", "  b: 2")), [0, "a"])).toBeUndefined();
    expect(deleteEntry(parse(lines("- - a", "    # c", "  - b")), [0, 0])).toBeUndefined();
  });

  it("leaves the comments above the only entry under the empty collection", () => {
    expect(deleteEntry(parse(lines("k:", "  # c", "  a: 1", "z: 1")), ["k", "a"])).toBe(
      lines("k: {}", "  # c", "z: 1"),
    );
    expect(deleteEntry(parse(lines("# c", "b: 1")), ["b"])).toBe(lines("# c", "{}"));
    expect(deleteEntry(parse(lines("k:", "  - a")), ["k", 0])).toBe(lines("k: []"));
    expect(deleteEntry(parse(lines("k:", "  -")), ["k", 0])).toBeUndefined();
  });
});
