import { unwrap } from "@halonicjs/std";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readYaml } from "./read.ts";
import { writeYamlFile } from "./write.ts";

/** U+FEFF, the byte order mark some Windows editors put at the start of a file. */
const byteOrderMark = String.fromCodePoint(0xfeff);
const lineSeparator = String.fromCodePoint(0x2028);

/** Plain data as workspace files hold it: no `undefined`, no `-0`. */
const plainData = fc
  .jsonValue({ noUnicodeString: false })
  .map((value) => JSON.parse(JSON.stringify(value)));

/** Text a stranger's workspace could contain, including odd Unicode. */
const hostileText = fc.oneof(
  fc.string({ unit: "binary", maxLength: 200 }),
  fc.string({
    unit: fc.constantFrom(..."[]{}:-?&*!|>'\"#%@`, \n\r\t\x00a1", byteOrderMark, lineSeparator),
    maxLength: 200,
  }),
  plainData.map((data) => writeYamlFile(data)),
);

/** Lists and maps inside each other, written out as YAML. */
const nestedText = fc
  .array(fc.constantFrom("[", "{ k: ", "- ", "k:\n "), { maxLength: 300 })
  .map((openers) => openers.join(""));

describe("yaml.read-hostile", () => {
  it("never throws, and every problem has a 1-based line and column", () => {
    fc.assert(
      fc.property(hostileText, (text) => {
        const read = readYaml(text);
        if (!read.ok) {
          expect(read.error.line).toBeGreaterThanOrEqual(1);
          expect(read.error.col).toBeGreaterThanOrEqual(1);
          expect(read.error.message).not.toContain("\n");
        }
      }),
      { numRuns: 500 },
    );
  });

  it("reads nesting up to the depth limit, or reports it as too deep", () => {
    fc.assert(
      fc.property(nestedText, (text) => {
        const read = readYaml(text);
        expect(read.ok || read.error.kind !== "unsupported").toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe("yaml.round-trip", () => {
  it("reads written data back unchanged, and writes it the same way again", () => {
    fc.assert(
      fc.property(plainData, (data) => {
        const written = writeYamlFile(data);
        const readBack = unwrap(readYaml(written)).data;
        expect(readBack).toEqual(data);
        expect(writeYamlFile(readBack)).toBe(written);
      }),
      { numRuns: 500 },
    );
  });

  it("reads the same data with Windows line endings", () => {
    fc.assert(
      fc.property(plainData, (data) => {
        const windows = writeYamlFile(data).replaceAll("\n", "\r\n");
        expect(unwrap(readYaml(windows)).data).toEqual(data);
      }),
      { numRuns: 300 },
    );
  });

  it("reads the same data after a byte order mark, for files whose top level is a map", () => {
    const topLevelMap = fc.dictionary(fc.string(), plainData);
    fc.assert(
      fc.property(topLevelMap, (data) => {
        expect(unwrap(readYaml(`${byteOrderMark}${writeYamlFile(data)}`)).data).toEqual(data);
      }),
      { numRuns: 300 },
    );
  });
});
