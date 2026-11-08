import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editYaml, type YamlEdited } from "./edit.ts";
import type { YamlEdit } from "./edit-data.ts";
import { readYaml } from "./read.ts";

function edited(text: string, ...edits: YamlEdit[]): YamlEdited {
  return unwrap(editYaml(text, edits));
}

function dataOf(text: string): unknown {
  return unwrap(readYaml(text)).data;
}

function problemOf(text: string, ...edits: YamlEdit[]): string {
  const result = editYaml(text, edits);
  if (result.ok) {
    throw new Error(`Expected a problem, got ${JSON.stringify(result.value.text)}`);
  }
  expect(result.error.kind).toBe("bad-edit");
  return result.error.message;
}

const lines = (...all: string[]) => `${all.join("\n")}\n`;

verifies("yaml.edit", () => {
  it("sets a value", () => {
    expect(dataOf(edited("name: Billing\n", set(["name"], "Invoices")).text)).toEqual({
      name: "Invoices",
    });
  });

  it("creates missing maps, also in an empty text and under an empty key", () => {
    expect(edited("", set(["top", "inner"], 1)).text).toBe("top:\n  inner: 1\n");
    expect(dataOf(edited("env:\nname: x\n", set(["env", "KEY"], "x")).text)).toEqual({
      env: { KEY: "x" },
      name: "x",
    });
  });

  it("inserts list items at the front and at the end", () => {
    const text = lines("steps:", "  - a", "  - b");
    const result = edited(text, insert(["steps", 0], "first"), insert(["steps", 3], "last"));
    expect(dataOf(result.text)).toEqual({ steps: ["first", "a", "b", "last"] });
  });

  it("replaces a whole map: deletes what it lacks, adds new keys at the end", () => {
    const result = edited(lines("a: 1", "b: 2", "c: 3"), set([], { a: 1, c: 4, d: 5 }));
    expect(result.text).toBe(lines("a: 1", "c: 4", "d: 5"));
  });

  it("changes nothing for a delete where nothing sits", () => {
    expect(edited("a: 1\n", del(["missing"]), del(["b", "x", "y"])).text).toBe("a: 1\n");
  });

  it("never follows inherited keys such as __proto__ and constructor", () => {
    const hasOwn = Object.prototype.hasOwnProperty;
    expect(edited("a: 1\n", del(["__proto__", "hasOwnProperty"])).text).toBe("a: 1\n");
    expect(edited("a: 1\n", del(["constructor", "x"]), del(["toString"])).text).toBe("a: 1\n");
    expect(Object.prototype.hasOwnProperty).toBe(hasOwn);

    const proto = dataOf(edited("a: 1\n", set(["__proto__", "x"], 1)).text) as object;
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
    expect(JSON.stringify(proto)).toBe('{"a":1,"__proto__":{"x":1}}');
    expect(dataOf(edited("a: 1\n", set(["constructor", "x"], 1)).text)).toEqual({
      a: 1,
      constructor: { x: 1 },
    });
    expect(problemOf("a: 1\n", insert(["__proto__", 0], 1))).toContain('no list at "__proto__"');
    expect(problemOf("a: 1\n", insert(["constructor", 0], 1))).toContain("no list");
    expect(Object.prototype).not.toHaveProperty("x");
  });

  it("lets each edit see the one before", () => {
    const result = edited("{}\n", set(["a"], { b: 1 }), set(["a", "c"], 2));
    expect(dataOf(result.text)).toEqual({ a: { b: 1, c: 2 } });
  });
});

verifies("yaml.edit-preserve", () => {
  it("changes nothing when the value is already there", () => {
    const text = "# top\nq: 'x'   # odd spacing\nn: 0x1F\n";
    expect(edited(text, set(["q"], "x"), set(["n"], 31), set([], dataOf(text)))).toEqual({
      text,
      layout: "kept",
    });
  });

  it("changes only the value's characters and keeps the comment on its line", () => {
    const result = edited("# billing\nname: Billing # shown in the list\n", set(["name"], "x"));
    expect(result).toEqual({ text: "# billing\nname: x # shown in the list\n", layout: "kept" });
  });

  it("keeps the quote style of a quoted text", () => {
    expect(edited("q: 'it'\n", set(["q"], "it's")).text).toBe("q: 'it''s'\n");
    expect(edited('q: "a"\n', set(["q"], "yes")).text).toBe('q: "yes"\n');
  });

  it("changes only the fields that differ when a whole map is set", () => {
    const text = lines("steps:", "  # check first", "  - id: check # the id", "    retries: 2");
    expect(edited(text, set(["steps", 0], { id: "check", retries: 3 }))).toEqual({
      text: lines("steps:", "  # check first", "  - id: check # the id", "    retries: 3"),
      layout: "kept",
    });
  });

  it("adds keys at their map's indent, quoted by the library", () => {
    const result = edited(lines("a:", "  b: 1", "c: 2"), set(["a", "yes"], "null"));
    expect(result).toEqual({
      text: lines("a:", "  b: 1", '  yes: "null"', "c: 2"),
      layout: "kept",
    });
  });

  it("keeps a | block a | block", () => {
    const text = lines("run: |", "  one", "  two", "next: 1");
    expect(edited(text, set(["run"], "three\nfour\n")).text).toBe(
      lines("run: |", "  three", "  four", "next: 1"),
    );
  });

  it("keeps the comment at the top of the file when it sets the whole document", () => {
    const result = edited(lines("# top", "", "a: 1 # c", "b: 2"), set([], { a: 1, c: 3 }));
    expect(result).toEqual({ text: lines("# top", "", "a: 1 # c", "c: 3"), layout: "kept" });
    // A flow collection is rendered again; the top comment must survive that too,
    // with or without a blank line under it.
    const flow = { tools: ["c"], n: 1 };
    expect(edited(lines("# top", "", "tools: [a, b]", "n: 1"), set([], flow))).toEqual({
      text: lines("# top", "", "tools:", "  - c", "n: 1"),
      layout: "reformatted",
    });
    expect(edited(lines("# top", "tools: [a, b]", "n: 1"), set([], flow)).text).toBe(
      lines("# top", "tools:", "  - c", "n: 1"),
    );
    expect(edited(lines("# top", "- [a, b]", "- y"), set([], [["z"]])).text).toBe(
      lines("# top", "- - z"),
    );
  });

  it("splices a whole-map set into key edits when no key goes away", () => {
    const result = edited(lines("# top", "a: 1 # c", "b: 2"), set([], { a: 1, b: 3, d: 4 }));
    expect(result).toEqual({ text: lines("# top", "a: 1 # c", "b: 3", "d: 4"), layout: "kept" });
  });

  it("keeps a byte order mark", () => {
    const text = "\uFEFFa: 1\nb: 2\n";
    expect(edited(text, set(["a"], 2))).toEqual({ text: "\uFEFFa: 2\nb: 2\n", layout: "kept" });
    expect(edited(text, set(["c"], 3), del(["a"]))).toEqual({
      text: "\uFEFFb: 2\nc: 3\n",
      layout: "kept",
    });
  });

  it("handles an edit inside a flow list", () => {
    const result = edited("# tools\ntools: [a, b]\n", set(["tools", 0], "c"));
    expect(result.layout).toBe("reformatted");
    expect(result.text).toContain("# tools");
    expect(dataOf(result.text)).toEqual({ tools: ["c", "b"] });
  });

  it("keeps the comment on a key's line when it replaces the value under it", () => {
    const text = lines("a: # about a", "  b: 1", "c: 2");
    expect(edited(text, set(["a"], 5))).toEqual({
      text: lines("a: 5 # about a", "c: 2"),
      layout: "kept",
    });
    expect(edited(text, set(["a"], ["x"])).text).toBe(lines("a: # about a", "  - x", "c: 2"));
    expect(edited(lines("a: # about a", "c: 2"), set(["a", "b"], 1))).toEqual({
      text: lines("a: # about a", "  b: 1", "c: 2"),
      layout: "kept",
    });
    expect(edited(lines("run: | # the script", "  one", "n: 1"), set(["run"], "x")).text).toBe(
      lines("run: x # the script", "n: 1"),
    );
    expect(edited(lines("- # first", "  b: 1", "- 2"), set([0], 5))).toEqual({
      text: lines("- 5 # first", "- 2"),
      layout: "kept",
    });
    expect(edited(lines('"a" : # about a', "  b: 1", "c: 2"), set(["a"], 5))).toEqual({
      text: lines('"a": 5 # about a', "c: 2"),
      layout: "kept",
    });
  });
});

verifies("yaml.edit-line-endings", () => {
  const windows = (...all: string[]) => `${all.join("\r\n")}\r\n`;

  it("writes new lines with \\r\\n in a text that uses \\r\\n", () => {
    expect(edited(windows("a: 1", "b: 2"), set(["c"], 3))).toEqual({
      text: windows("a: 1", "b: 2", "c: 3"),
      layout: "kept",
    });
    const list = windows("steps:", "  # the check", "  - check", "  - b");
    expect(edited(list, insert(["steps", 0], "first"), del(["steps", 2]))).toEqual({
      text: windows("steps:", "  - first", "  # the check", "  - check"),
      layout: "kept",
    });
  });

  it("falls back when a text mixes line endings", () => {
    const result = edited("a: 1\r\nb: 2\n", set(["c"], 3));
    expect(result.layout).toBe("reformatted");
    expect(dataOf(result.text)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("keeps \\r\\n when it renders the document again", () => {
    expect(edited(windows("# tools", "tools: [x]"), set(["tools", 0], "y"))).toEqual({
      text: windows("# tools", "tools: [ y ]"),
      layout: "reformatted",
    });
  });
});

verifies("yaml.edit-preserve-entries", () => {
  it("inserts above the comment over the item it goes before", () => {
    const text = lines("steps:", "  # the check", "  - check");
    expect(edited(text, insert(["steps", 0], "first"))).toEqual({
      text: lines("steps:", "  - first", "  # the check", "  - check"),
      layout: "kept",
    });
  });

  it("deletes an entry with its trailing comment and keeps the comments above it", () => {
    const text = lines("a: 1", "# about b", "b: 2 # gone", "c: 3");
    expect(edited(text, del(["b"]))).toEqual({
      text: lines("a: 1", "# about b", "c: 3"),
      layout: "kept",
    });
  });

  it("keeps sections one blank line apart after a delete", () => {
    expect(edited("a: 1\n\nb: 2\n\nc: 3\n", del(["b"])).text).toBe("a: 1\n\nc: 3\n");
  });

  it("leaves no blank line at the start or the end of the file", () => {
    expect(edited("a: |\n  x\n\nb: 2\n", del(["a"]))).toEqual({ text: "b: 2\n", layout: "kept" });
    expect(edited("﻿a: 1\n\n\nb: 2\n", del(["a"])).text).toBe("﻿b: 2\n");
    expect(edited("a: 1\n\n\nb: 2\n", del(["b"]))).toEqual({ text: "a: 1\n", layout: "kept" });
    // A blank line that already ended the file stays.
    expect(edited("a: 1\n\nb: 2\n\n", del(["b"])).text).toBe("a: 1\n\n");
    expect(edited(lines("x:", "  - a", "", "  - b"), del(["x", 1])).text).toBe(
      lines("x:", "  - a"),
    );
  });

  it("moves a comment left under a deleted block to the next entry's indent", () => {
    expect(edited(lines("a:", "  x: 1", "  # about b", "b: 2"), del(["a"]))).toEqual({
      text: lines("# about b", "b: 2"),
      layout: "kept",
    });
    expect(
      edited(lines("s:", "  - a:", "      x: 1", "    # about b", "  - b"), del(["s", 0])).text,
    ).toBe(lines("s:", "  # about b", "  - b"));
    // A comment over a less indented line isn't the next entry's; it stays put.
    expect(
      edited(lines("p:", "  z: 0", "  a:", "    x: 1", "    # c", "q: 1"), del(["p", "a"])).text,
    ).toBe(lines("p:", "  z: 0", "    # c", "q: 1"));
  });

  it("leaves [] or {} when the last entry goes", () => {
    expect(edited(lines("steps:", "  - a", "n: 1"), del(["steps", 0])).text).toBe(
      lines("steps: []", "n: 1"),
    );
    expect(edited(lines("# top", "a: 1"), del(["a"])).text).toBe(lines("# top", "{}"));
  });

  it("keeps the comments above the last entry of a nested map or list", () => {
    expect(edited(lines("a:", "  # keep me", "  x: 1", "b: 2"), del(["a", "x"]))).toEqual({
      text: lines("a: {}", "  # keep me", "b: 2"),
      layout: "kept",
    });
    expect(edited(lines("s:", "  # about a", "  - a", "n: 1"), del(["s", 0]))).toEqual({
      text: lines("s: []", "  # about a", "n: 1"),
      layout: "kept",
    });
  });

  it("falls back rather than drop a comment that isn't above the entry", () => {
    const text = lines("a:", "  # one", "", "  # two", "  x: 1", "b: 2");
    const result = edited(text, del(["a", "x"]));
    expect(result.layout).toBe("reformatted");
    expect(result.text).toContain("# one");
    expect(result.text).toContain("# two");
  });

  it("splices a whole-list set that changes the list's length", () => {
    const text = lines("steps:", "  - a # first", "  - b");
    expect(edited(text, set(["steps"], ["a", "b", "c"]))).toEqual({
      text: lines("steps:", "  - a # first", "  - b", "  - c"),
      layout: "kept",
    });
    expect(edited(text, set(["steps"], ["a"]))).toEqual({
      text: lines("steps:", "  - a # first"),
      layout: "kept",
    });
  });
});

verifies("yaml.edit-problems", () => {
  it("returns the read problem for an unreadable text", () => {
    const result = editYaml("a: [1\n", [set(["a"], 1)]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual(unwrapProblem(readYaml("a: [1\n")));
  });

  it("explains paths that don't fit", () => {
    expect(problemOf("name: Billing\n", set(["name", "first"], 1))).toBe(
      '"name" holds text, not a map or a list.',
    );
    expect(problemOf("steps: [a, b]\n", set(["steps", 2], "c"))).toContain("use insert");
    expect(problemOf("steps: [a]\n", set(["steps", 5], "c"))).toContain("no item 5");
    expect(problemOf("", set(["steps", 0, "id"], "a"))).toContain("set creates only maps");
    expect(problemOf("a: 1\n", del([]))).toContain("set [] to {}");
    expect(problemOf("a: 1\n", insert(["a"], 1))).toContain("ends in a list index");
    expect(problemOf("a: 1\n", insert(["b", 0], 1))).toContain('no list at "b"');
    expect(problemOf("a: [1]\n", set(["a", "x"], 1))).toContain("is a list");
    expect(problemOf("a: {}\n", set(["a", 0], 1))).toContain("is a map");
    expect(problemOf("a: [1]\n", set(["a", -1], 1))).toContain("whole number");
  });

  it.each([
    ["undefined", undefined],
    ["undefined inside an object", { a: undefined }],
    ["undefined inside a list", [1, undefined]],
    ["a hole in a list", withHole()],
    ["a function", () => 1],
    ["a symbol", Symbol("s")],
    ["a bigint", 1n],
    ["a Date", new Date(0)],
    ["a Map", new Map()],
    ["data that contains itself", selfContaining()],
  ])("rejects %s as a value", (_name, value) => {
    expect(problemOf("a: 1\n", set(["a"], value))).toMatch(/YAML (can't hold|holds only)/);
  });

  it("names the edit that doesn't fit and returns no text", () => {
    const result = editYaml("a: 1\n", [set(["b"], 2), del([]), set(["c"], 3)]);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "bad-edit",
        edit: 1,
        message: "delete needs a path; to empty the file, set [] to {}.",
      },
    });
  });

  it("rejects a result past the depth or length limit", () => {
    const deep = editYaml("a: 1\n", [set(["a"], { b: { c: { d: 1 } } })], {
      maxDepth: 3,
      maxLength: 1000,
    });
    expect(!deep.ok && deep.error.kind).toBe("bad-edit");
    const long = editYaml("a: 1\n", [set(["a"], "x".repeat(20))], { maxDepth: 10, maxLength: 10 });
    expect(!long.ok && long.error.message).toMatch(/the limit is 10/);
  });
});

function set(path: YamlEdit["path"], value: unknown): YamlEdit {
  return { kind: "set", path, value };
}

function insert(path: YamlEdit["path"], value: unknown): YamlEdit {
  return { kind: "insert", path, value };
}

function del(path: YamlEdit["path"]): YamlEdit {
  return { kind: "delete", path };
}

/** `[1, <empty>, 3]`: the middle index doesn't exist at all. */
function withHole(): unknown[] {
  const list: unknown[] = [1];
  list[2] = 3;
  return list;
}

function selfContaining(): unknown {
  const value: { self?: unknown } = {};
  value.self = value;
  return value;
}

function unwrapProblem<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): E {
  if (result.ok) {
    throw new Error("Expected a problem");
  }
  return result.error;
}
