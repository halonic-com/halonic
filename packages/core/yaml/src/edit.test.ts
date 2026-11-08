import { unwrap } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
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

describe("yaml.edit", () => {
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

describe("yaml.edit layout", () => {
  it("changes nothing when the value is already there", () => {
    const text = "# top\nq: 'x'   # odd spacing\nn: 0x1F\n";
    expect(edited(text, set(["q"], "x"), set(["n"], 31), set([], dataOf(text)))).toEqual({
      text,
      layout: "kept",
    });
  });

  it("keeps comments when it renders the parsed document again", () => {
    const result = edited("# billing\nname: Billing # shown in the list\n", set(["name"], "x"));
    expect(result).toEqual({
      text: "# billing\nname: x # shown in the list\n",
      layout: "reformatted",
    });
  });

  it("keeps the comment at the top of the file when it sets the whole document", () => {
    const result = edited(lines("# top", "", "a: 1 # c", "b: 2"), set([], { a: 1, c: 3 }));
    expect(result).toEqual({ text: lines("# top", "", "a: 1", "c: 3"), layout: "reformatted" });
    // Without a blank line the library hangs the comment on the first key or item.
    expect(edited(lines("# top", "a: 1 # c", "b: 2"), set([], { a: 1, c: 3 })).text).toBe(
      lines("# top", "a: 1", "c: 3"),
    );
    expect(edited(lines("# top", "- x", "- y"), set([], ["z"])).text).toBe(lines("# top", "- z"));
  });

  it("keeps a byte order mark", () => {
    const text = "\uFEFFa: 1\nb: 2\n";
    expect(edited(text, set(["c"], 3), del(["a"])).text).toBe("\uFEFFb: 2\nc: 3\n");
  });

  it("handles an edit inside a flow list", () => {
    const result = edited("# tools\ntools: [a, b]\n", set(["tools", 0], "c"));
    expect(result.layout).toBe("reformatted");
    expect(result.text).toContain("# tools");
    expect(dataOf(result.text)).toEqual({ tools: ["c", "b"] });
  });
});

describe("yaml.edit-problems", () => {
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
