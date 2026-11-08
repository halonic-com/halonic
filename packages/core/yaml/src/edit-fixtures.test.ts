import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isCollection, isPair, isScalar, type Node, parseDocument } from "yaml";
import { editYaml } from "./edit.ts";
import { applyEditToData, type YamlEdit } from "./edit-data.ts";
import { readYaml, type YamlPath } from "./read.ts";

/** Every YAML file under `examples/` in the old repo at 784f78d. */
const examplesRoot = join(import.meta.dirname, "test", "fixtures", "examples-784f78d");

const exampleFiles = readdirSync(examplesRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
  .map((entry) => join(entry.parentPath, entry.name))
  .sort()
  .map((path) => ({ name: relative(examplesRoot, path), text: readFileSync(path, "utf8") }));

interface Leaf {
  readonly path: YamlPath;
  readonly value: unknown;
  /** The 0-based lines the value's text covers. */
  readonly firstLine: number;
  readonly lastLine: number;
}

/**
 * The scalar values of a file and the lines they cover. Values inside flow
 * collections (`[a, b]`) are left out until editing those keeps the layout.
 */
function leavesOf(text: string): Leaf[] {
  const document = parseDocument(text);
  const leaves: Leaf[] = [];
  const lineOf = (offset: number) => text.slice(0, offset).split("\n").length - 1;
  const visit = (node: unknown, path: YamlPath): void => {
    if (isCollection(node)) {
      if (node.flow === true) return;
      node.items.forEach((item: unknown, index) => {
        if (isPair(item)) {
          const key = isScalar(item.key) ? String(item.key.value) : "";
          visit(item.value, [...path, key]);
        } else {
          visit(item, [...path, index]);
        }
      });
      return;
    }
    const range = (node as Node).range;
    if (range != null) {
      const value = (node as Node).toJS(document);
      leaves.push({ path, value, firstLine: lineOf(range[0]), lastLine: lineOf(range[1]) });
    }
  };
  visit(document.contents, []);
  return leaves;
}

/** A different value of the same kind. */
function changed(value: unknown): unknown {
  if (typeof value === "string") return value.includes("\n") ? `${value}more\n` : `${value} 2`;
  if (typeof value === "number") return value + 1;
  if (typeof value === "boolean") return !value;
  return "now set";
}

/**
 * The lines that differ between two texts, as the range of `before` that was
 * replaced: everything outside it is the same in both.
 */
function changedLines(before: string, after: string): { first: number; last: number } {
  const old = before.split("\n");
  const now = after.split("\n");
  let prefix = 0;
  while (prefix < old.length && prefix < now.length && old[prefix] === now[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < old.length - prefix &&
    suffix < now.length - prefix &&
    old[old.length - 1 - suffix] === now[now.length - 1 - suffix]
  ) {
    suffix++;
  }
  return { first: prefix, last: old.length - 1 - suffix };
}

function expectKept(text: string, edit: YamlEdit): string {
  const result = unwrap(editYaml(text, [edit]));
  expect(result.layout).toBe("kept");
  const expected = unwrap(applyEditToData(unwrap(readYaml(text)).data, edit));
  expect(unwrap(readYaml(result.text)).data).toEqual(expected);
  return result.text;
}

verifies("yaml.edit-preserve", () => {
  it("has the 20 example files", () => {
    expect(exampleFiles).toHaveLength(20);
  });

  it.each(exampleFiles)("changes no byte of $name when every leaf is set to itself", ({ text }) => {
    const edits = leavesOf(text).map(
      (leaf): YamlEdit => ({ kind: "set", path: leaf.path, value: leaf.value }),
    );
    expect(edits.length).toBeGreaterThan(0);
    expect(editYaml(text, edits)).toEqual({ ok: true, value: { text, layout: "kept" } });
  });

  it.each(exampleFiles)("changes only the leaf's lines when a leaf of $name is set", ({ text }) => {
    for (const leaf of leavesOf(text)) {
      const after = expectKept(text, { kind: "set", path: leaf.path, value: changed(leaf.value) });
      const lines = changedLines(text, after);
      expect(lines.first).toBeGreaterThanOrEqual(leaf.firstLine);
      expect(lines.last).toBeLessThanOrEqual(leaf.lastLine);
    }
  });
});
