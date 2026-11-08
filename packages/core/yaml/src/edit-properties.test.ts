import { deepEqual, unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { editYaml } from "./edit.ts";
import { applyEditToData, type YamlEdit } from "./edit-data.ts";
import { readYaml, type YamlPath } from "./read.ts";
import { spliceEdit } from "./splice.ts";
import { writeYamlFile } from "./write.ts";

/** Hundreds of runs per test, so allow for a busy CI runner. */
vi.setConfig({ testTimeout: 20_000 });

/** Plain data as workspace files hold it: no `undefined`, no `-0`. */
const plainData = fc
  .jsonValue({ maxDepth: 4 })
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

/** A `set` that fits `data`: a new value somewhere in it, or a new key in one of its maps. */
function editFor(data: unknown): fc.Arbitrary<YamlEdit> {
  const located = valuesOf(data);
  const maps = located.filter((at) => isRecord(at.value));
  const inside = located.filter((at) => at.path.length > 0);
  const options: fc.Arbitrary<YamlEdit>[] = [
    fc.record({ kind: fc.constant("set"), path: pick(inside), value: plainData }),
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
  return fc.oneof(...options);
}

/**
 * True when a whole map is set over a map, or a list over a list. The diff
 * may then need a delete or an insert, which isn't spliced yet.
 */
function mayNeedDeleteOrInsert(data: unknown, edit: YamlEdit): boolean {
  const current = valuesOf(data).find((at) => deepEqual(at.path, edit.path))?.value;
  const value = edit.kind === "set" ? edit.value : undefined;
  const filledList = (it: unknown) => Array.isArray(it) && it.length > 0;
  const filledMap = (it: unknown) => isRecord(it) && Object.keys(it).length > 0;
  return (filledList(current) && filledList(value)) || (filledMap(current) && filledMap(value));
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
  it("splices any fitting set into text that reads back as the edited data", () => {
    const fileAndEdit = fileData.chain((data) => fc.tuple(fc.constant(data), editFor(data)));
    fc.assert(
      fc.property(fileAndEdit, ([data, edit]) => {
        const text = writeYamlFile(data);
        const expected = unwrap(applyEditToData(data, edit));
        // The splicer itself, so a fallback can't hide a bug.
        const spliced = spliceEdit(text, edit);
        if (spliced === undefined) {
          expect(mayNeedDeleteOrInsert(data, edit)).toBe(true);
          return;
        }
        expect(unwrap(readYaml(spliced)).data).toEqual(expected);
        expect(unwrap(editYaml(text, [edit])).layout).toBe("kept");
      }),
      { numRuns: 300 },
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
      { numRuns: 300 },
    );
  });
});

verifies("yaml.edit-preserve", () => {
  const tricky = fc
    .oneof(
      fc.constantFrom(
        ..."yes,no,null,Null,1.0,0x1,0o7,~,true,.inf,-.nan,a: b,#x,- x,[a],{a},*a,&a,!t,%x,@x,`x,'q',\"q\"".split(
          ",",
        ),
        "",
        " lead",
        "trail ",
        "\n",
        "a\nb",
        "a\n",
      ),
      fc.string({ maxLength: 20 }),
    )
    .filter((text) => text !== "first" && text !== "list");

  it("reads every new text value and key back as the same string", () => {
    fc.assert(
      fc.property(tricky, (text) => {
        const file = "# keep\nfirst: 1\nlist:\n  - a\n";
        const edits: YamlEdit[] = [
          { kind: "set", path: ["first"], value: text },
          { kind: "set", path: [text, "x"], value: text },
          { kind: "set", path: ["list", 0], value: text },
        ];
        const expected = { first: text, list: [text], [text]: { x: text } };
        for (const edit of edits) {
          const spliced = spliceEdit(file, edit) ?? "";
          const want = unwrap(applyEditToData(unwrap(readYaml(file)).data, edit));
          expect(unwrap(readYaml(spliced)).data).toEqual(want);
        }
        const all = unwrap(editYaml(file, edits));
        expect(all.layout).toBe("kept");
        expect(unwrap(readYaml(all.text)).data).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });
});
