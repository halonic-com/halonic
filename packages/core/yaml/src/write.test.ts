import { AssertionError } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { writeFrontMatter, writeYamlFile } from "./write.ts";

// Golden tests: the expected text is written out by hand from what the old
// app saved (yaml 2.9.1, the options in 784f78d). If a yaml upgrade changes
// any of it, these fail before a user's files do.

describe("yaml.write-file", () => {
  it("writes maps and lists in block style", () => {
    const workflow = {
      name: "Invoice",
      steps: [
        { id: "check", tools: ["mail", "ledger"] },
        { id: "send", retries: 2, strict: true, note: null },
      ],
    };
    expect(writeYamlFile(workflow)).toBe(
      [
        "name: Invoice",
        "steps:",
        "  - id: check",
        "    tools:",
        "      - mail",
        "      - ledger",
        "  - id: send",
        "    retries: 2",
        "    strict: true",
        "    note: null",
        "",
      ].join("\n"),
    );
  });

  it("quotes text that would read back as another type or as structure", () => {
    const values = {
      nullWord: "null",
      tilde: "~",
      trueWord: "true",
      octalLike: "012",
      number: "42",
      colon: "a: b",
      hash: "#c",
      dash: "- x",
      empty: "",
      leadingSpace: " lead",
    };
    expect(writeYamlFile(values)).toBe(
      [
        'nullWord: "null"',
        'tilde: "~"',
        'trueWord: "true"',
        'octalLike: "012"',
        'number: "42"',
        'colon: "a: b"',
        'hash: "#c"',
        'dash: "- x"',
        'empty: ""',
        'leadingSpace: " lead"',
        "",
      ].join("\n"),
    );
  });

  it("leaves yes, no, on and off unquoted, as YAML 1.2 reads them as text", () => {
    expect(writeYamlFile({ a: "yes", b: "no", c: "on", d: "off" })).toBe(
      "a: yes\nb: no\nc: on\nd: off\n",
    );
  });

  it("writes multi-line text as a literal block", () => {
    expect(writeYamlFile({ prompt: "Check the lines.\nThen send." })).toBe(
      "prompt: |-\n  Check the lines.\n  Then send.\n",
    );
    expect(writeYamlFile({ prompt: "Ends with a newline\n" })).toBe(
      "prompt: |\n  Ends with a newline\n",
    );
  });

  it("folds long text at 100 columns", () => {
    const words = Array.from({ length: 30 }, (_, index) => `word${index}`).join(" ");
    expect(writeYamlFile({ description: words })).toBe(
      [
        "description: word0 word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13",
        "  word14 word15 word16 word17 word18 word19 word20 word21 word22 word23 word24 word25 word26 word27",
        "  word28 word29",
        "",
      ].join("\n"),
    );
  });

  it("writes empty lists and maps in flow style, and keys whose value is undefined not at all", () => {
    expect(writeYamlFile({ tools: [], limits: {}, model: undefined })).toBe(
      "tools: []\nlimits: {}\n",
    );
  });

  it("writes numbers the way JavaScript prints them, in YAML form", () => {
    expect(writeYamlFile({ a: 1.5, b: -3, c: 1e21, d: 0.1 })).toBe(
      "a: 1.5\nb: -3\nc: 1e+21\nd: 0.1\n",
    );
  });

  it("escapes control characters and keeps other Unicode as is", () => {
    expect(writeYamlFile({ bell: "a\x07b", accents: "café ✓" })).toBe(
      'bell: "a\\ab"\naccents: café ✓\n',
    );
  });

  it("throws for undefined, which has no YAML form", () => {
    expect(() => writeYamlFile(undefined)).toThrow(AssertionError);
    expect(() => writeYamlFile(undefined)).toThrow(
      "Expected data that YAML can hold, but got undefined.",
    );
  });
});

describe("yaml.write-front-matter", () => {
  it("writes the fields without a trailing newline", () => {
    expect(writeFrontMatter({ name: "invoice-style", description: "How invoices read" })).toBe(
      "name: invoice-style\ndescription: How invoices read",
    );
  });

  it("folds long text at 80 columns, the library default", () => {
    const words = Array.from({ length: 16 }, (_, index) => `word${index}`).join(" ");
    expect(writeFrontMatter({ name: "n", description: words })).toBe(
      [
        "name: n",
        "description: word0 word1 word2 word3 word4 word5 word6 word7 word8 word9 word10",
        "  word11 word12 word13 word14 word15",
      ].join("\n"),
    );
  });

  it("quotes values like the file writer does", () => {
    expect(writeFrontMatter({ name: "null", description: "a: b" })).toBe(
      'name: "null"\ndescription: "a: b"',
    );
  });
});
