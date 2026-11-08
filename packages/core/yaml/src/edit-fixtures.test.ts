import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
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

/**
 * Each leaf edit reads the file three times and the check once more, so the
 * largest file takes a few hundred milliseconds here but over 5 s on a busy
 * CI runner. Allow for that.
 */
vi.setConfig({ testTimeout: 20_000 });

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
  const lineOf = lineFinder(text);
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

/**
 * Finds the 0-based line of an offset in `text`. The line starts are found
 * once and binary-searched, so a file with many leaves stays linear.
 */
function lineFinder(text: string): (offset: number) => number {
  const starts = [0];
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) {
    starts.push(at + 1);
  }
  return (offset) => {
    // The last line that starts at or before the offset.
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((starts[middle] as number) <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  };
}

/** A different value of the same kind. */
function changed(value: unknown): unknown {
  if (typeof value === "string") return value.includes("\n") ? `${value}more\n` : `${value} 2`;
  if (typeof value === "number") return value + 1;
  if (typeof value === "boolean") return !value;
  return "now set";
}

/**
 * The lines that differ between two texts, as the range of `old`, the lines
 * before, that was replaced: everything outside it is the same in both.
 */
function changedLines(old: readonly string[], after: string): { first: number; last: number } {
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

/**
 * Edits `text` and checks the layout was kept and the result reads back as
 * `data`, the data of `text`, with the edit applied. Callers read `data` once
 * per file rather than once per edit.
 */
function expectKept(text: string, data: unknown, edit: YamlEdit): string {
  const result = unwrap(editYaml(text, [edit]));
  expect(result.layout).toBe("kept");
  const expected = unwrap(applyEditToData(data, edit));
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
    const data = unwrap(readYaml(text)).data;
    const lines = text.split("\n");
    for (const leaf of leavesOf(text)) {
      const edit: YamlEdit = { kind: "set", path: leaf.path, value: changed(leaf.value) };
      const changes = changedLines(lines, expectKept(text, data, edit));
      expect(changes.first).toBeGreaterThanOrEqual(leaf.firstLine);
      expect(changes.last).toBeLessThanOrEqual(leaf.lastLine);
    }
  });
});
