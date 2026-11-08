import { verifies } from "@halonicjs/testing-spec";
import { writeYamlFile } from "@halonicjs/yaml";
import { describe, expect, test } from "vitest";
import { compact } from "./compact.ts";
import compactGolden from "./golden/compact.json" with { type: "json" };
import yamlGolden from "./golden/compact-yaml.json" with { type: "json" };
import { decodeUndefined } from "./test/golden.ts";

// The YAML golden file is the text the old app's toYaml (commit 784f78d) wrote
// for the inputs of the compact golden file: stringify(compact(value)) with a
// line width of 100. Saving a file in the new app has to give the same text,
// so the first save doesn't rewrite every file.
//
// The golden file keeps each text as its lines, which reads better in a diff
// than one string full of escaped line breaks.

function textOf(lines: readonly string[]): string {
  return lines.map((line) => `${line}\n`).join("");
}

function inputNamed(name: string): unknown {
  const goldenCase = compactGolden.cases.find((candidate) => candidate.name === name);
  if (goldenCase === undefined) {
    throw new Error(`The compact golden file has no case named "${name}".`);
  }
  return decodeUndefined(goldenCase.input);
}

verifies("format.compact-yaml", () => {
  describe("writes the text the old app's toYaml wrote", () => {
    test.each(yamlGolden.cases)("$name", ({ name, lines }) => {
      expect(writeYamlFile(compact(inputNamed(name)))).toBe(textOf(lines));
    });

    test("covers every compact case that is a map or a list, the four example files included", () => {
      const documentCases = compactGolden.cases.filter((goldenCase) => {
        const input = decodeUndefined(goldenCase.input);
        return typeof input === "object" && input !== null;
      });
      expect(yamlGolden.cases.map((yamlCase) => yamlCase.name)).toStrictEqual(
        documentCases.map((goldenCase) => goldenCase.name),
      );
    });
  });
});
