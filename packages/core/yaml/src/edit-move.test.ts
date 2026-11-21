import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { editYaml, type YamlEdited } from "./edit.ts";
import { applyEditToData, type YamlEdit } from "./edit-data.ts";
import { readYaml, type YamlPath } from "./read.ts";
import { spliceEdit } from "./splice.ts";
import { writeYamlFile } from "./write.ts";

/** A busy CI runner is much slower than a laptop; see `edit-properties.test.ts`. */
vi.setConfig({ testTimeout: 20_000 });

const move = (path: YamlPath, to: number): YamlEdit => ({ kind: "move", path, to });

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

const abc = lines("on:", "  - a", "  - b", "  - c", "next: 1");

verifies("yaml.edit-move", () => {
  it("moves the first item to the end and the last item to the front", () => {
    expect(edited(abc, move(["on", 0], 2))).toEqual({
      layout: "kept",
      text: lines("on:", "  - b", "  - c", "  - a", "next: 1"),
    });
    expect(edited(abc, move(["on", 2], 0))).toEqual({
      layout: "kept",
      text: lines("on:", "  - c", "  - a", "  - b", "next: 1"),
    });
  });

  it("moves an item at the end of a text with no line break at the end", () => {
    const text = "on:\n  - a\n  - b\n  - c";
    expect(edited(text, move(["on", 2], 0))).toEqual({
      layout: "kept",
      text: "on:\n  - c\n  - a\n  - b",
    });
    expect(edited(text, move(["on", 0], 2))).toEqual({
      layout: "kept",
      text: "on:\n  - b\n  - c\n  - a",
    });
  });

  it("moves an item over several lines as one block", () => {
    const text = lines(
      "on:",
      "  - to: review",
      "    when:",
      "      score: low",
      "  - to: send",
      "    when: ok",
    );
    expect(edited(text, move(["on", 0], 1))).toEqual({
      layout: "kept",
      text: lines(
        "on:",
        "  - to: send",
        "    when: ok",
        "  - to: review",
        "    when:",
        "      score: low",
      ),
    });
  });

  it("takes the comment lines above the item and the comment at the end of its line along", () => {
    const text = lines(
      "on:",
      "  # back to the writer",
      "  # when the review fails",
      "  - to: write # retry",
      "  - to: send",
      "  # the last way out",
      "  - to: stop # gives up",
    );
    expect(edited(text, move(["on", 0], 2))).toEqual({
      layout: "kept",
      text: lines(
        "on:",
        "  - to: send",
        "  # the last way out",
        "  - to: stop # gives up",
        "  # back to the writer",
        "  # when the review fails",
        "  - to: write # retry",
      ),
    });
  });

  it("takes the comment at the end of a multi-line item's last line along", () => {
    const text = lines("on:", "  - to: a", "    when: x # only then", "  - to: b");
    expect(edited(text, move(["on", 1], 0)).text).toBe(
      lines("on:", "  - to: b", "  - to: a", "    when: x # only then"),
    );
  });

  it("leaves a comment above the first item at the list key's indent under the key", () => {
    const text = lines("on:", "# the ways out", "  - a", "  - b");
    expect(edited(text, move(["on", 0], 1)).text).toBe(
      lines("on:", "# the ways out", "  - b", "  - a"),
    );
  });

  it("leaves a blank line between items in its place", () => {
    const text = lines("on:", "  - a", "", "  # about b", "  - b", "  - c");
    expect(edited(text, move(["on", 0], 2)).text).toBe(
      lines("on:", "  # about b", "  - b", "", "  - c", "  - a"),
    );
  });

  it("leaves a comment indented under an item with that item", () => {
    const text = lines("on:", "  - to: a", "    # more to come", "  - to: b");
    expect(edited(text, move(["on", 0], 1)).text).toBe(
      lines("on:", "  - to: b", "  - to: a", "    # more to come"),
    );
  });

  it("moves a list item at the top of the file, and a list under a key at the key's column", () => {
    expect(edited(lines("- a # one", "- b"), move([1], 0)).text).toBe(lines("- b", "- a # one"));
    expect(edited(lines("on:", "- a", "- b # two"), move(["on", 1], 0)).text).toBe(
      lines("on:", "- b # two", "- a"),
    );
  });

  it("moves an item among equal ones with its comments", () => {
    const text = lines("on:", "  # the first", "  - a", "  - a");
    expect(edited(text, move(["on", 0], 1))).toEqual({
      layout: "kept",
      text: lines("on:", "  - a", "  # the first", "  - a"),
    });
  });

  it("keeps \\r\\n line breaks", () => {
    expect(edited("on:\r\n  - a # one\r\n  - b\r\n", move(["on", 0], 1))).toEqual({
      layout: "kept",
      text: "on:\r\n  - b\r\n  - a # one\r\n",
    });
  });

  it("writes a flow list on one line again", () => {
    expect(edited("on: [a, b, c] # ways\n", move(["on", 0], 2))).toEqual({
      layout: "kept",
      text: "on: [b, c, a] # ways\n",
    });
  });

  it("moves the item's node in the parsed document when the text can't be spliced", () => {
    // A flow list over several lines can't be spliced.
    const result = edited("on: [\n  a, # one\n  b\n]\n", move(["on", 0], 1));
    expect(result.layout).toBe("reformatted");
    expect(unwrap(readYaml(result.text)).data).toEqual({ on: ["b", "a"] });
    // Nor can a list whose first item shares the line of the item it is in.
    expect(edited("- - a\n  - b # c\n", move([0, 0], 1)).layout).toBe("reformatted");
    // Nor can a text that mixes line endings; the comments the library hangs on the item's node
    // go with it.
    expect(edited("on:\r\n  - a\n  # two\n  - b # two\n", move(["on", 1], 0))).toEqual({
      layout: "reformatted",
      text: "on:\n  # two\n  - b # two\n  - a\n",
    });
  });

  it("changes no character when the item stays at its index", () => {
    const text = lines("on: # c", "  - a", "  - b");
    expect(edited(text, move(["on", 1], 1))).toEqual({ layout: "kept", text });
  });

  it("is a bad-edit when the path doesn't end in a list index", () => {
    expect(problemOf("a: {x: 1}\n", move(["a", "x"], 0))).toBe(
      "move needs a path that ends in a list index.",
    );
    expect(problemOf("a: 1\n", move([], 0))).toBe("move needs a path that ends in a list index.");
    expect(problemOf("a: {x: 1}\n", move(["a", 0], 0))).toBe('There is no list at "a" to move in.');
    expect(problemOf("a: 1\n", move(["a", 0], 0))).toBe('There is no list at "a" to move in.');
  });

  it("is a bad-edit when no item is at the path", () => {
    expect(problemOf(abc, move(["on", 3], 0))).toBe('There is no item 3 in "on"; the list has 3.');
    expect(problemOf("a: 1\n", move(["b", 0], 0))).toBe('There is no list at "b" to move in.');
  });

  it("is a bad-edit when `to` isn't an index of the list", () => {
    const where = `move can't put the item at`;
    expect(problemOf(abc, move(["on", 0], 3))).toBe(
      `${where} 3; "on" has 3, so to goes from 0 to 2.`,
    );
    expect(problemOf(abc, move(["on", 0], -1))).toBe(
      `${where} -1; "on" has 3, so to goes from 0 to 2.`,
    );
    expect(problemOf(abc, move(["on", 0], 0.5))).toBe(
      "move needs a whole number to move to, not 0.5.",
    );
    expect(problemOf(abc, { kind: "move", path: ["on", 0], to: "1" as unknown as number })).toBe(
      "move needs a whole number to move to, not text.",
    );
  });

  /** Data with a list somewhere, and a move inside one of its lists. */
  const listAndMove = fc
    .dictionary(
      fc.string({ maxLength: 6 }),
      fc.array(
        fc.oneof(
          fc.string({ maxLength: 8 }),
          fc.integer(),
          fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fc.string({ maxLength: 8 }), {
            minKeys: 1,
            maxKeys: 3,
          }),
        ),
        { minLength: 1, maxLength: 4 },
      ),
      { minKeys: 1, maxKeys: 3 },
    )
    .chain((data) =>
      fc.constantFrom(...Object.keys(data)).chain((key) => {
        const length = (data[key] as unknown[]).length;
        return fc.tuple(
          fc.constant(data),
          fc.constant(key),
          fc.nat(length - 1),
          fc.nat(length - 1),
        );
      }),
    );

  /** A comment line above every line, and a comment at the end of every line. */
  function commentEveryLine(text: string): string {
    return text
      .split("\n")
      .map((line, index) => (line === "" ? line : `# above ${index}\n${line} # on ${index}`))
      .join("\n");
  }

  /** The lines of a text in sorted order: a move changes only their order. */
  function sortedLines(text: string): string[] {
    return text.split("\n").sort();
  }

  it("splices any move into text that reads back as the moved data, with every line kept", () => {
    fc.assert(
      fc.property(listAndMove, ([data, key, from, to]) => {
        const edit = move([key, from], to);
        const expected = unwrap(applyEditToData(data, edit));
        for (const text of [writeYamlFile(data), commentEveryLine(writeYamlFile(data))]) {
          // The splicer itself, so a fallback can't hide a bug.
          const spliced = spliceEdit(text, edit);
          expect(spliced).toBeDefined();
          expect(unwrap(readYaml(spliced ?? "")).data).toEqual(expected);
          expect(sortedLines(spliced ?? "")).toEqual(sortedLines(text));
        }
      }),
      { numRuns: 100 },
    );
  });
});
