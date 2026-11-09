import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editYaml } from "./edit.ts";
import type { YamlEdit } from "./edit-data.ts";
import { defaultYamlLimits } from "./read.ts";

// A text that mixes line endings can't be spliced, so every edit here takes the
// `reformatted` fallback, which renders the document again.
const mixed = "a: 1 # about a\r\nb: 2\n";

function edited(text: string, ...edits: YamlEdit[]) {
  // "~" stands for a carriage return, so the inputs do not read as Windows paths.
  return unwrap(editYaml(text.replaceAll("~", "\r"), edits));
}

const set = (path: YamlEdit["path"], value: unknown): YamlEdit => ({ kind: "set", path, value });
const insert = (path: YamlEdit["path"], value: unknown): YamlEdit => ({
  kind: "insert",
  path,
  value,
});

verifies("yaml.edit", () => {
  it("reports the worst layout any edit needed", () => {
    // The second edit splices fine on the text the first one rendered again.
    const result = edited(mixed, set(["c"], 3), set(["d"], 4));
    expect(result.layout).toBe("reformatted");
    expect(result.text).toBe("a: 1 # about a\nb: 2\nc: 3\nd: 4\n");
    // And the other way round: a splice first, a render after.
    expect(edited("a: 1\nc: []\n", set(["b"], 2), insert(["c", 0], 1)).layout).toBe("kept");
    expect(edited("t: [a,\n  b]\nn: 1\n", set(["n"], 2), insert(["t", 0], "c")).layout).toBe(
      "reformatted",
    );
  });

  it("leaves the text byte for byte when an edit changes no data", () => {
    expect(edited("a: 'x'\n", set(["a"], "x"))).toEqual({ text: "a: 'x'\n", layout: "kept" });
    expect(edited(mixed, set(["a"], 1))).toEqual({ text: mixed, layout: "kept" });
  });

  it("stops at a result over the length limit, however it was rendered", () => {
    const limits = { ...defaultYamlLimits, maxLength: 40 };
    const long = "x".repeat(60);
    for (const text of ["a: 1\n", "a: 1\r\nb: 2\n"]) {
      const result = editYaml(text, [set(["c"], long)], limits);
      expect(result).toMatchObject({
        ok: false,
        error: { kind: "bad-edit", edit: 0, message: expect.stringContaining("limit is 40") },
      });
    }
  });
});

verifies("yaml.edit-preserve", () => {
  it("changes a scalar in place when it renders again, so its comment stays", () => {
    expect(edited(mixed, set(["a"], 2)).text).toBe("a: 2 # about a\nb: 2\n");
    expect(edited(mixed, set(["a"], null)).text).toBe("a: null # about a\nb: 2\n");
    expect(edited(mixed, set(["a"], true)).text).toBe("a: true # about a\nb: 2\n");
  });

  it("replaces a scalar by a map or a list when it renders again", () => {
    expect(edited(mixed, set(["a"], { x: 1 })).text).toBe("a\x3a\n  x: 1\nb: 2\n");
    expect(edited(mixed, set(["a"], [1])).text).toBe("a\x3a\n  - 1\nb: 2\n");
  });

  it("creates the maps under a missing or empty key when it renders again", () => {
    expect(edited(mixed, set(["x", "y", "z"], 1)).text).toBe(
      "a: 1 # about a\nb: 2\nx\x3a\n  y\x3a\n    z: 1\n",
    );
    expect(edited("a:~\nn: 1\n", set(["a", "b"], 1)).text).toBe("a\x3a\n  b: 1\nn: 1\n");
    expect(edited("a:~\nb: 2\n", set(["a", "c", "d"], 1)).text).toBe(
      "a\x3a\n  c\x3a\n    d: 1\nb: 2\n",
    );
    // A key that exists keeps its place and its other keys.
    expect(edited("a:~\n  q: 1~\nn: 1\n", set(["a", "b"], 1)).text).toBe(
      "a\x3a\n  q: 1\n  b: 1\nn: 1\n",
    );
  });

  it("inserts into a nested list when it renders again", () => {
    expect(edited("a\x3a\n  tools: [x,\n    y]\n", insert(["a", "tools", 0], "z")).text).toBe(
      "a\x3a\n  tools: [ z, x, y ]\n",
    );
  });

  it("keeps a comment at the top of a file set as a whole when it renders again", () => {
    const set0 = set([], { z: 1 });
    expect(edited("# c\n\n\na: 1~\n", set0).text).toBe("# c\n\nz: 1\n");
    expect(edited("#c\n\n#d\na: 1~\nb: 2\n", set0).text).toBe("#c\n\n#d\nz: 1\n");
    expect(edited("# t\na: [x,\n y]\n", set0).text).toBe("# t\nz: 1\n");
    expect(edited("# top\nfoo # c~\n", set([], "bar")).text).toBe("# top\nbar # c\n");
    expect(edited("foo~\n", set0).text).toBe("z: 1\r\n");
  });

  it("writes long values on lines up to 100 characters when it renders again", () => {
    const words = Array.from({ length: 19 }, () => "word").join(" ");
    expect(edited(mixed, set(["c"], words)).text).toBe(`a: 1 # about a\nb: 2\nc: ${words}\n`);
  });
});

verifies("yaml.edit-line-endings", () => {
  it("keeps one byte order mark when it renders again", () => {
    const result = edited("\uFEFFa: 1~\nb: 2\n", set(["c"], 3));
    expect(result.text).toBe("\uFEFFa: 1\nb: 2\nc: 3\n");
    expect(result.layout).toBe("reformatted");
    expect(edited("a: 1~\nb: 2\n", set(["c"], 3)).text.startsWith("\uFEFF")).toBe(false);
  });
});
