import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readYaml } from "./read.ts";

/** U+FEFF, the byte order mark some Windows editors put at the start of a file. */
const byteOrderMark = String.fromCodePoint(0xfeff);

const dataOf = (text: string): unknown => unwrap(readYaml(text)).data;

verifies("yaml.read-data", () => {
  it("reads block maps and lists", () => {
    expect(dataOf("name: Billing\nsteps:\n  - id: check\n  - id: send\n")).toEqual({
      name: "Billing",
      steps: [{ id: "check" }, { id: "send" }],
    });
  });

  it("reads flow maps and lists", () => {
    expect(dataOf("tags: [a, 'b c']\nlimits: { tokens: 100, retries: 2 }\n")).toEqual({
      tags: ["a", "b c"],
      limits: { tokens: 100, retries: 2 },
    });
  });

  it("reads escapes in double-quoted text", () => {
    // `${"\\"}u` puts a backslash before the u, keeping the escape in the YAML text.
    expect(dataOf(String.raw`text: "line\nnext \"quoted\" back\\slash ${"\\"}u00e9"`)).toEqual({
      text: 'line\nnext "quoted" back\\slash é',
    });
  });

  it("reads literal and folded blocks with chomping indicators", () => {
    const text = "keep: |\n  a\n  b\nstrip: |-\n  a\n  b\nfold: >\n  a\n  b\nfoldKeep: >+\n  a\n\n";
    expect(dataOf(text)).toEqual({
      keep: "a\nb\n",
      strip: "a\nb",
      fold: "a b\n",
      foldKeep: "a\n\n",
    });
  });

  it("ignores comments", () => {
    expect(dataOf("# heading\nname: Billing # trailing\n")).toEqual({ name: "Billing" });
  });

  it("keeps yes, no, on and off as text, as YAML 1.2 does", () => {
    expect(dataOf("a: yes\nb: no\nc: on\nd: off\ne: true\nf: ~\n")).toEqual({
      a: "yes",
      b: "no",
      c: "on",
      d: "off",
      e: true,
      f: null,
    });
  });

  it("gives null for an empty file and for a file with only comments", () => {
    expect(dataOf("")).toBeNull();
    expect(dataOf("# nothing here\n")).toBeNull();
  });

  it("reads a byte order mark and Windows line endings", () => {
    expect(dataOf(`${byteOrderMark}a: 1\r\nb:\r\n  - x\r\n`)).toEqual({ a: 1, b: ["x"] });
  });

  it("rejects a byte order mark right before a top-level block list, as the old app did", () => {
    // A quirk of yaml 2.9.1, kept for parity. Workspace files start with a map.
    expect(readYaml(`${byteOrderMark}- a\n`)).toMatchObject({
      ok: false,
      error: { kind: "syntax", line: 1, col: 4 },
    });
    expect(dataOf(`${byteOrderMark}[a]\n`)).toEqual(["a"]);
  });

  it("keeps a __proto__ key as plain data, without touching the prototype", () => {
    const data = dataOf("__proto__:\n  polluted: true\n") as Record<string, unknown>;
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    expect(Object.keys(data)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

verifies("yaml.read-syntax-error", () => {
  it("reports an unclosed flow list with its line and column", () => {
    expect(readYaml("a: [1, 2\n")).toEqual({
      ok: false,
      error: {
        kind: "syntax",
        message: "Flow sequence in block collection must be sufficiently indented and end with a ]",
        line: 2,
        col: 1,
      },
    });
  });

  it("reports a duplicate key where the second one starts", () => {
    expect(readYaml("name: a\nname: b\n")).toEqual({
      ok: false,
      error: { kind: "syntax", message: "Map keys must be unique", line: 2, col: 1 },
    });
  });

  it("reports only the first problem", () => {
    const read = readYaml("a: [1\nb: 'open\n");
    expect(read.ok).toBe(false);
    expect(read.ok ? undefined : read.error.line).toBe(2);
  });
});

verifies("yaml.read-unsupported", () => {
  const problemOf = (text: string) => {
    const read = readYaml(text);
    return read.ok ? undefined : read.error;
  };

  it("rejects an anchor where its value starts", () => {
    expect(problemOf("base: &shared 1\n")).toEqual({
      kind: "unsupported",
      message: "Anchors (&name) are not supported in workspace files. Write the value out in full.",
      line: 1,
      col: 15,
    });
  });

  it("rejects an alias where it starts, before it is ever resolved", () => {
    expect(problemOf("a: 1\nb: *shared\n")).toEqual({
      kind: "unsupported",
      message: "Aliases (*name) are not supported in workspace files. Write the value out in full.",
      line: 2,
      col: 4,
    });
  });

  it("reports the first unsupported feature in document order", () => {
    expect(problemOf("a: &x 1\nb: *x\n")).toMatchObject({
      message: expect.stringMatching(/^Anchors/),
      line: 1,
    });
  });

  it("rejects an alias to its own anchor, so no circular data is ever returned", () => {
    const cases: [string, number, number][] = [
      ["a: &x\n  b: *x\n", 2, 3],
      ["&l [ *l ]\n", 1, 4],
    ];
    for (const [text, line, col] of cases) {
      const read = readYaml(text);
      expect(read.ok).toBe(false);
      expect(read).not.toHaveProperty("data");
      expect(read).toMatchObject({
        error: { kind: "unsupported", message: expect.stringMatching(/^Anchors/), line, col },
      });
    }
  });

  it("rejects a tag, also a built-in one", () => {
    for (const text of ["count: !!str 2\n", "count: !custom 2\n", "!!map\na: 1\n"]) {
      expect(problemOf(text)).toMatchObject({
        kind: "unsupported",
        message: expect.stringMatching(/^Tags such as/),
      });
    }
  });

  it("rejects a second document where it starts", () => {
    expect(problemOf("a: 1\n---\nb: 2\n")).toEqual({
      kind: "unsupported",
      message: 'Workspace files hold one YAML document. Remove the second "---" or split the file.',
      line: 2,
      col: 1,
    });
  });

  it("accepts one document with a leading --- and a directive", () => {
    expect(dataOf("%YAML 1.2\n---\na: 1\n")).toEqual({ a: 1 });
  });

  it("rejects a list or map used as a key", () => {
    expect(problemOf("? [a, b]\n: 1\n")).toEqual({
      kind: "unsupported",
      message: "Lists and maps are not supported as keys in workspace files. Use a plain key.",
      line: 1,
      col: 3,
    });
    expect(problemOf("{ { a: 1 }: x }\n")).toMatchObject({ kind: "unsupported", col: 3 });
  });
});
