import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { editYaml } from "./edit.ts";
import { applyEditToData, type YamlEdit } from "./edit-data.ts";
import { readYaml, type YamlPath } from "./read.ts";
import { spliceEdit } from "./splice.ts";
import { writeYamlFile } from "./write.ts";

/**
 * A busy CI runner is over ten times slower than a laptop, so the runs below stay small: each
 * property aims at about 3 s on a normal CI run.
 */
vi.setConfig({ testTimeout: 20_000 });

/** Plain data as workspace files hold it: no `undefined`, no `-0`. */
const plainData = fc
  .jsonValue({ maxDepth: 3 })
  .map((value) => JSON.parse(JSON.stringify(value)) as unknown);

/** A workspace-like file: a map at the top. */
const fileData = fc.dictionary(fc.string({ maxLength: 8 }), plainData, { maxKeys: 6 });

/** Text on one line, short enough that it never folds. */
const shortText = fc.string({ maxLength: 15 }).filter((text) => !/[\r\n]/.test(text));
const scalar = fc.oneof(shortText, fc.integer(), fc.boolean(), fc.constant(null));
const scalarData: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    scalar,
    fc.array(tie("value"), { minLength: 1, maxLength: 3 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), tie("value"), {
      minKeys: 1,
      maxKeys: 3,
    }),
  ),
})).value;

interface Located {
  readonly path: YamlPath;
  readonly value: unknown;
}

/** Every value in the data with its path, the top included. */
function valuesOf(data: unknown, path: YamlPath = []): Located[] {
  const here: Located = { path, value: data };
  if (Array.isArray(data)) {
    return [here, ...data.flatMap((item, index) => valuesOf(item, [...path, index]))];
  }
  if (typeof data === "object" && data !== null) {
    const entries = Object.entries(data);
    return [here, ...entries.flatMap(([key, child]) => valuesOf(child, [...path, key]))];
  }
  return [here];
}

/** An edit that fits `data`: set, add, delete or insert somewhere in it. */
function editFor(data: unknown): fc.Arbitrary<YamlEdit> {
  const located = valuesOf(data);
  const maps = located.filter((at) => isRecord(at.value));
  const lists = located.filter((at) => Array.isArray(at.value));
  const inside = located.filter((at) => at.path.length > 0);
  const options: fc.Arbitrary<YamlEdit>[] = [
    fc.record({ kind: fc.constant("set"), path: pick(inside), value: plainData }),
    fc.record({ kind: fc.constant("delete"), path: pick(inside) }),
  ];
  if (maps.length > 0) {
    const newKey = fc.tuple(fc.constantFrom(...maps), fc.string({ maxLength: 8 }));
    options.push(
      newKey.chain(([map, key]) =>
        fc.record({
          kind: fc.constant("set"),
          path: fc.constant([...map.path, key]),
          value: plainData,
        }),
      ),
    );
  }
  if (lists.length > 0) {
    options.push(
      fc.constantFrom(...lists).chain((list) =>
        fc.record({
          kind: fc.constant("insert"),
          path: fc.nat((list.value as unknown[]).length).map((index) => [...list.path, index]),
          value: plainData,
        }),
      ),
    );
  }
  return fc.oneof(...options);
}

function pick(located: Located[]): fc.Arbitrary<YamlPath> {
  return located.length === 0
    ? fc.constant(["a"])
    : fc.constantFrom(...located.map((at) => at.path));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A comment line above every line, and a trailing comment on every line. */
function commentEveryLine(text: string): string {
  return text
    .split("\n")
    .map((line, index) => (line === "" ? line : `# above ${index}\n${line} # on ${index}`))
    .join("\n");
}

verifies("yaml.edit", () => {
  // Two tests rather than one, so each check has the whole timeout to itself on a busy runner.
  const fileAndEdit = fileData.chain((data) => fc.tuple(fc.constant(data), editFor(data)));

  it("splices any fitting edit into text that reads back as the edited data", () => {
    fc.assert(
      fc.property(fileAndEdit, ([data, edit]) => {
        const text = writeYamlFile(data);
        const expected = unwrap(applyEditToData(data, edit));
        // The splicer itself, so a fallback can't hide a bug.
        const spliced = spliceEdit(text, edit);
        expect(spliced).toBeDefined();
        expect(unwrap(readYaml(spliced ?? "")).data).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });

  it("keeps the layout of the text for any fitting edit", () => {
    fc.assert(
      fc.property(fileAndEdit, ([data, edit]) => {
        expect(unwrap(editYaml(writeYamlFile(data), [edit])).layout).toBe("kept");
      }),
      { numRuns: 100 },
    );
  });
});

/** A comment line above every line. */
function commentAboveEveryLine(text: string): string {
  return text
    .split("\n")
    .map((line, index) => (line === "" ? line : `# above ${index}\n${line}`))
    .join("\n");
}

function countLines(text: string, comments: boolean): number {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "" && line.trim().startsWith("#") === comments).length;
}

verifies("yaml.edit-line-endings", () => {
  it("splices any fitting edit into a \\r\\n text with \\r\\n line breaks only", () => {
    const fileAndEdit = fileData.chain((data) => fc.tuple(fc.constant(data), editFor(data)));
    fc.assert(
      fc.property(fileAndEdit, fc.boolean(), ([data, edit], comments) => {
        const plain = writeYamlFile(data);
        const text = comments ? commentEveryLine(plain) : plain;
        const spliced = spliceEdit(text.replaceAll("\n", "\r\n"), edit);
        expect(spliced ?? "").not.toMatch(/(^|[^\r])\n/);
        if (!comments) {
          // Without comments every fitting edit splices, as on `\n` text.
          expect(spliced).toBeDefined();
          expect(unwrap(readYaml(spliced ?? "")).data).toEqual(unwrap(applyEditToData(data, edit)));
        }
      }),
      { numRuns: 200 },
    );
  });
});

verifies("yaml.edit-preserve", () => {
  const leafSet = scalarData
    .filter((data) => typeof data === "object" && data !== null)
    .chain((data) => {
      const leaves = valuesOf(data).filter(
        (at) => typeof at.value !== "object" || at.value === null,
      );
      return fc.tuple(fc.constant(data), fc.constantFrom(...leaves), scalar, fc.boolean());
    });

  it("changes only the leaf's line, with comments on every line and either line ending", () => {
    fc.assert(
      fc.property(leafSet, ([data, leaf, value, windows]) => {
        const plain = commentEveryLine(writeYamlFile(data));
        const text = windows ? plain.replaceAll("\n", "\r\n") : plain;
        const line = unwrap(readYaml(text)).positionOf(leaf.path)?.line ?? 0;
        const edit: YamlEdit = { kind: "set", path: leaf.path, value };
        const spliced = spliceEdit(text, edit) ?? "";
        expect(unwrap(readYaml(spliced)).data).toEqual(unwrap(applyEditToData(data, edit)));
        const before = text.split("\n");
        const after = spliced.split("\n");
        expect(after).toHaveLength(before.length);
        before.forEach((old, index) => {
          if (index !== line - 1) expect(after[index]).toBe(old);
        });
      }),
      { numRuns: 150 },
    );
  });
});

verifies("yaml.edit-preserve", () => {
  /** Texts YAML reads as something else unless they are quoted: always tried, never sampled. */
  const trickyTexts = [
    ..."yes,no,null,Null,1.0,0x1,0o7,~,true,.inf,-.nan,a: b,#x,- x,[a],{a},*a,&a,!t,%x,@x,`x,'q',\"q\"".split(
      ",",
    ),
    "",
    " lead",
    "trail ",
    "\n",
    "a\nb",
    "a\n",
  ];
  const randomText = fc
    .string({ maxLength: 20 })
    .filter((text) => text !== "first" && text !== "list");

  it("reads every new text value and key back as the same string", () => {
    fc.assert(
      fc.property(randomText, (text) => {
        const file = "# keep\nfirst: 1\nlist:\n  - a\n";
        const edits: YamlEdit[] = [
          { kind: "set", path: ["first"], value: text },
          { kind: "set", path: [text, "x"], value: text },
          { kind: "insert", path: ["list", 0], value: text },
        ];
        const expected = { first: text, list: [text, "a"], [text]: { x: text } };
        for (const edit of edits) {
          const spliced = spliceEdit(file, edit) ?? "";
          const want = unwrap(applyEditToData(unwrap(readYaml(file)).data, edit));
          expect(unwrap(readYaml(spliced)).data).toEqual(want);
        }
        const all = unwrap(editYaml(file, edits));
        expect(all.layout).toBe("kept");
        expect(unwrap(readYaml(all.text)).data).toEqual(expected);
      }),
      { numRuns: 60, examples: trickyTexts.map((text) => [text]) },
    );
  });
});

verifies("yaml.edit-preserve-entries", () => {
  const deleteInside = scalarData
    .filter((data) => typeof data === "object" && data !== null)
    .chain((data) => {
      const inside = valuesOf(data).filter((at) => at.path.length > 0);
      return fc.tuple(fc.constant(data), fc.constantFrom(...inside));
    });

  it("deletes only the comments between the deleted entry's own lines", () => {
    fc.assert(
      fc.property(deleteInside, ([data, at]) => {
        const text = commentAboveEveryLine(writeYamlFile(data));
        const edit: YamlEdit = { kind: "delete", path: at.path };
        const expected = unwrap(applyEditToData(data, edit));
        const spliced = spliceEdit(text, edit);
        // Falling back is allowed here; losing a comment while splicing isn't.
        if (spliced === undefined) {
          return;
        }
        expect(unwrap(readYaml(spliced)).data).toEqual(expected);
        // The entry's own lines, rendered alone: only the comments between them go.
        const key = at.path[at.path.length - 1] as string | number;
        const entry = typeof key === "number" ? [at.value] : { [key]: at.value };
        const ownLines = countLines(writeYamlFile(entry), false);
        expect(countLines(text, true) - countLines(spliced, true)).toBe(ownLines - 1);
      }),
      { numRuns: 150 },
    );
  });
});

/** True when a map in `data` has a key like `"0"`, which JavaScript orders first. */
function hasIndexKey(data: unknown): boolean {
  return valuesOf(data).some(
    (at) => isRecord(at.value) && Object.keys(at.value).some((key) => /^(0|[1-9]\d*)$/.test(key)),
  );
}

/** How far in each line of `text` starts. */
function indentsOf(text: string): number[] {
  return text.split("\n").map((line) => line.length - line.trimStart().length);
}

verifies("yaml.edit-style", () => {
  /** A map and a list under keys up front, so the file shows its style. */
  const styledData = fileData.map((data) => ({ "~style": { map: { a: 1 }, list: [1] }, ...data }));
  const style = fc.record({ indent: fc.integer({ min: 2, max: 4 }), indentSeq: fc.boolean() });

  it("indents every edit the way the file does, as the library would", () => {
    const fileAndEdit = styledData.chain((data) => fc.tuple(fc.constant(data), editFor(data)));
    fc.assert(
      fc.property(fileAndEdit, style, ([data, edit], indent) => {
        const text = stringify(data, { lineWidth: 100, ...indent });
        const expected = unwrap(applyEditToData(data, edit));
        // JavaScript puts keys like "0" first, so the library's order differs from the file's.
        fc.pre(!hasIndexKey(expected));
        const spliced = spliceEdit(text, edit) ?? "";
        const read = unwrap(readYaml(spliced)).data;
        expect(read).toEqual(expected);
        // Render the data as read back, so the library follows the file's key order (a set keeps
        // shared keys where they were). Quotes may differ (a quoted text keeps its quotes); the
        // indents may not.
        expect(indentsOf(spliced)).toEqual(
          indentsOf(stringify(read, { lineWidth: 100, ...indent })),
        );
      }),
      { numRuns: 100 },
    );
  });
});
