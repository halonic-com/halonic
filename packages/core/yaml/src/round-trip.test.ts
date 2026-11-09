import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parse as parseWithLibrary } from "yaml";
import { readYaml } from "./read.ts";
import { type FrontMatterFields, writeFrontMatter, writeYamlFile } from "./write.ts";

/** Every YAML file and SKILL.md under `examples/` in the old repo at 784f78d. */
const examplesRoot = join(import.meta.dirname, "test", "fixtures", "examples-784f78d");

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

const exampleFiles = filesUnder(examplesRoot).map((path) => ({
  name: relative(examplesRoot, path),
  text: readFileSync(path, "utf8"),
}));
const yamlFiles = exampleFiles.filter((file) => file.name.endsWith(".yaml"));
const skillFiles = exampleFiles.filter((file) => file.name.endsWith("SKILL.md"));

/** The front matter block of a SKILL.md, found the way the old app found it. */
function frontMatterOf(markdown: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  return match?.[1] ?? "";
}

verifies("yaml.round-trip", () => {
  it("has the 20 example files and the one skill", () => {
    expect(yamlFiles).toHaveLength(20);
    expect(skillFiles).toHaveLength(1);
  });

  it.each(yamlFiles)("reads $name to the same data as the yaml library", ({ text }) => {
    expect(unwrap(readYaml(text)).data).toEqual(parseWithLibrary(text));
  });

  it.each(yamlFiles)("writes $name back to text that reads to the same data", ({ text }) => {
    const data = unwrap(readYaml(text)).data;
    const written = writeYamlFile(data);
    expect(unwrap(readYaml(written)).data).toEqual(data);
  });

  it.each(yamlFiles)("writes $name the same way twice", ({ text }) => {
    const once = writeYamlFile(unwrap(readYaml(text)).data);
    expect(writeYamlFile(unwrap(readYaml(once)).data)).toBe(once);
  });

  it.each(skillFiles)("reads and writes the front matter of $name unchanged", ({ text }) => {
    const block = frontMatterOf(text);
    const fields = unwrap(readYaml(block)).data as FrontMatterFields;
    expect(writeFrontMatter(fields)).toBe(block);
  });
});

/**
 * Julian's parity fixtures: every YAML file the old app was recorded reading.
 * The mutation run copies this package into a sandbox, so it names the real
 * folder in HALONIC_PARITY_FIXTURES (see tooling/mutation).
 */
const parityRoot =
  process.env["HALONIC_PARITY_FIXTURES"] ??
  join(import.meta.dirname, "..", "..", "..", "testing", "parity", "fixtures");

interface Recording {
  diagnostics: { path: string; message: string; line?: number }[];
}

/** The broken cases: the file, and the line the old app's recording gave for its syntax problem. */
const brokenCases = filesUnder(join(parityRoot, "cases"))
  .filter((path) => path.endsWith("case.json"))
  .flatMap((path) => {
    const info = JSON.parse(readFileSync(path, "utf8")) as {
      fault?: string;
      expect?: { file: string };
    };
    if (info.fault !== "yaml-syntax" || !info.expect?.file.endsWith(".yaml")) return [];
    const recording = JSON.parse(
      readFileSync(join(path, "..", "recorded.json"), "utf8"),
    ) as Recording;
    const problem = recording.diagnostics.find((d) => d.path === info.expect?.file);
    const name = relative(join(parityRoot, "cases"), join(path, ".."));
    return [
      {
        name,
        file: join(path, "..", "files", info.expect.file),
        line: problem?.line,
      },
    ];
  });
const brokenFiles = new Set(brokenCases.map((c) => c.file));

const parityFiles = filesUnder(parityRoot)
  .filter((path) => path.endsWith(".yaml") && !brokenFiles.has(path))
  .map((path) => ({ name: relative(parityRoot, path), text: readFileSync(path, "utf8") }));

verifies("yaml.round-trip", () => {
  it("has the 175 valid files and the 3 broken cases", () => {
    expect(parityFiles).toHaveLength(175);
    expect(brokenCases).toHaveLength(3);
  });

  it.each(parityFiles)("reads $name to the same data as the yaml library", ({ text }) => {
    expect(unwrap(readYaml(text)).data).toEqual(parseWithLibrary(text));
  });

  it.each(parityFiles)("writes $name the same way twice", ({ text }) => {
    const once = writeYamlFile(unwrap(readYaml(text)).data);
    expect(writeYamlFile(unwrap(readYaml(once)).data)).toBe(once);
  });

  it.each(brokenCases)("gives $name a syntax problem on line $line", ({ file, line }) => {
    expect(line).toBeDefined();
    const result = readYaml(readFileSync(file, "utf8"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("syntax");
      expect(result.error.line).toBe(line);
    }
  });
});
