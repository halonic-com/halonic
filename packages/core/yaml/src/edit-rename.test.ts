import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editYaml, type YamlEdited } from "./edit.ts";
import { applyEditToData, type YamlEdit } from "./edit-data.ts";
import type { YamlPath } from "./read.ts";
import { readYaml } from "./read.ts";

const rename = (path: YamlPath, to: string): YamlEdit => ({ kind: "rename", path, to });

function edited(text: string, edit: YamlEdit): YamlEdited {
  return unwrap(editYaml(text, [edit]));
}

function problemOf(text: string, edit: YamlEdit): string {
  const result = editYaml(text, [edit]);
  if (result.ok) {
    throw new Error(`Expected a problem, got ${JSON.stringify(result.value.text)}`);
  }
  expect(result.error.kind).toBe("bad-edit");
  return result.error.message;
}

const lines = (...all: string[]) => `${all.join("\n")}\n`;

const workflow = lines(
  "states:",
  "  # writes the first version",
  "  write: # the first draft",
  "    agent: writer # who writes it",
  "    # where it goes next",
  "    next: send",
  "",
  "  send:",
  "    agent: mailer",
);

verifies("yaml.edit-rename", () => {
  it("renames only the key, so its value and every comment stay", () => {
    expect(edited(workflow, rename(["states", "write"], "draft"))).toEqual({
      layout: "kept",
      text: workflow.replace("  write:", "  draft:"),
    });
  });

  it("keeps the key's place in the map, in the text and in the data", () => {
    const result = edited(lines("a: 1", "b: 2", "c: 3"), rename(["b"], "z"));
    expect(result.text).toBe(lines("a: 1", "z: 2", "c: 3"));
    expect(Object.keys(unwrap(readYaml(result.text)).data as object)).toEqual(["a", "z", "c"]);
    const data = { a: 1, b: 2, c: 3 };
    expect(Object.keys(unwrap(applyEditToData(data, rename(["b"], "z"))) as object)).toEqual([
      "a",
      "z",
      "c",
    ]);
    expect(Object.keys(data)).toEqual(["a", "b", "c"]);
  });

  it("quotes a new name that would not read back as the same text unquoted", () => {
    expect(edited("a: 1 # c\n", rename(["a"], "1")).text).toBe('"1": 1 # c\n');
    expect(edited("a: 1 # c\n", rename(["a"], "a: b")).text).toBe('"a: b": 1 # c\n');
    expect(edited("a: 1 # c\n", rename(["a"], "")).text).toBe('"": 1 # c\n');
    expect(edited("a: 1 # c\n", rename(["a"], "x #y")).text).toBe('"x #y": 1 # c\n');
    // Our files are YAML 1.2, where `yes` is text, so it needs no quotes.
    expect(edited("a: 1 # c\n", rename(["a"], "yes")).text).toBe("yes: 1 # c\n");
    for (const to of ["1", "a: b", "", "x #y", "yes", "null", "- z"]) {
      const result = edited("a: 1\n", rename(["a"], to));
      expect(result.layout).toBe("kept");
      expect(unwrap(readYaml(result.text)).data).toEqual({ [to]: 1 });
    }
  });

  it("keeps the quote style of a quoted key", () => {
    expect(edited('"a": 1\nb: 2\n', rename(["a"], "c")).text).toBe('"c": 1\nb: 2\n');
    expect(edited("'a': 1\nb: 2\n", rename(["a"], "it's")).text).toBe("'it''s': 1\nb: 2\n");
  });

  it("renames a key in a flow map on its line", () => {
    expect(edited("env: {A: 1, C: 3} # c\n", rename(["env", "A"], "B"))).toEqual({
      layout: "kept",
      text: "env: {B: 1, C: 3} # c\n",
    });
    // In flow style a `,` ends a plain key, so this one gets quotes.
    expect(edited("env: {A: 1, C: 3}\n", rename(["env", "A"], "a,b")).text).toBe(
      'env: {"a,b": 1, C: 3}\n',
    );
  });

  it("renames through the parsed document when the text can't be spliced", () => {
    // A text that mixes line endings can't be spliced.
    const result = edited("a: 1\r\n# about b\nb: 2 # c\n", rename(["b"], "z"));
    expect(result).toEqual({ layout: "reformatted", text: "a: 1\n# about b\nz: 2 # c\n" });
  });

  it("writes the file from its data when neither the splice nor the document finds the key", () => {
    // A key with no text reads as "", but the parsed document holds no key node there.
    const result = edited(": 1\nb: 2 # c\n", rename([""], "a"));
    expect(result).toEqual({ layout: "rewritten", text: "a: 1\nb: 2\n" });
  });

  it("changes no character when the new name is the old one", () => {
    expect(edited(workflow, rename(["states", "write"], "write"))).toEqual({
      layout: "kept",
      text: workflow,
    });
  });

  it("is a bad-edit when the path doesn't end in a map key", () => {
    expect(problemOf("a: [1]\n", rename(["a", 0], "x"))).toBe(
      "rename needs a path that ends in a map key.",
    );
    expect(problemOf("a: [1]\n", rename(["a", "x"], "y"))).toBe(
      '"a" is a list; rename needs a path that ends in a map key.',
    );
    expect(problemOf("a: 1\n", rename(["a", "x"], "y"))).toBe('"a" holds a number, not a map.');
    expect(problemOf("a: 1\n", rename([], "y"))).toBe(
      "rename needs a path that ends in a map key.",
    );
  });

  it("is a bad-edit when no key is at the path", () => {
    expect(problemOf("a: 1\n", rename(["b"], "c"))).toBe('There is no key at "b" to rename.');
    expect(problemOf("a: 1\n", rename(["x", "b"], "c"))).toBe(
      'There is no key at "x.b" to rename.',
    );
    expect(problemOf("a\x3a\n", rename(["a", "b"], "c"))).toBe(
      'There is no key at "a.b" to rename.',
    );
  });

  it("is a bad-edit when the new name is already a key of the map", () => {
    const text = lines("a: 1", "b: 2");
    expect(problemOf(text, rename(["a"], "b"))).toBe(
      '"b" is already a key; rename doesn\'t merge keys.',
    );
    expect(
      editYaml(text, [{ kind: "set", path: ["c"], value: 3 }, rename(["a"], "b")]),
    ).toMatchObject({ ok: false, error: { kind: "bad-edit", edit: 1 } });
  });
});
