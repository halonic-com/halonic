import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readYaml } from "./read.ts";

/** U+FEFF, the byte order mark some Windows editors put at the start of a file. */
const byteOrderMark = String.fromCodePoint(0xfeff);

const workflow = [
  "name: Invoice", //            line 1
  "steps:", //                   line 2
  "  - id: check", //            line 3
  "    prompt: |", //            line 4
  "      Check the lines.", //   line 5
  "  - id: send", //             line 6
  "    tools: [mail, ledger]", // line 7
  "",
].join("\n");

const positionOf = (text: string, path: readonly (string | number)[]) =>
  unwrap(readYaml(text)).positionOf(path);

verifies("yaml.position-of", () => {
  it("gives the line and column of a value in a map", () => {
    expect(positionOf(workflow, ["name"])).toEqual({ line: 1, col: 7 });
  });

  it("follows list indexes and keys", () => {
    expect(positionOf(workflow, ["steps", 0, "id"])).toEqual({ line: 3, col: 9 });
    expect(positionOf(workflow, ["steps", 1])).toEqual({ line: 6, col: 5 });
  });

  it("points a block scalar at its indicator", () => {
    expect(positionOf(workflow, ["steps", 0, "prompt"])).toEqual({ line: 4, col: 13 });
  });

  it("gives a position for every value in a flow list", () => {
    expect(positionOf(workflow, ["steps", 1, "tools", 0])).toEqual({ line: 7, col: 13 });
    expect(positionOf(workflow, ["steps", 1, "tools", 1])).toEqual({ line: 7, col: 19 });
  });

  it("points a missing key at the map that should hold it", () => {
    expect(positionOf(workflow, ["steps", 1, "model"])).toEqual({ line: 6, col: 5 });
  });

  it("points a missing list item at its list", () => {
    expect(positionOf(workflow, ["steps", 9, "id"])).toEqual({ line: 3, col: 3 });
  });

  it("points the empty path, or a missing top-level key, at the top of the file", () => {
    expect(positionOf(workflow, [])).toEqual({ line: 1, col: 1 });
    expect(positionOf(workflow, ["description"])).toEqual({ line: 1, col: 1 });
  });

  it("points a key with no value at the end of its line", () => {
    expect(positionOf("a: 1\nmodel:\n", ["model"])).toEqual({ line: 2, col: 7 });
  });

  it("gives nothing for a file without data", () => {
    expect(positionOf("# only a comment\n", ["name"])).toBeUndefined();
  });

  it("counts lines after a Windows line ending and columns after a byte order mark", () => {
    expect(positionOf(`${byteOrderMark}a: 1\r\nb: 2\r\n`, ["b"])).toEqual({ line: 2, col: 4 });
    expect(positionOf(`${byteOrderMark}a: 1\r\n`, ["a"])).toEqual({ line: 1, col: 5 });
  });
});
