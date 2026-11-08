import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { unwrap } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { parse as parseWithLibrary } from "yaml";
import { readYaml } from "./read.ts";
import { writeFrontMatter, writeYamlFile } from "./write.ts";

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

describe("yaml.round-trip", () => {
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
    const fields = unwrap(readYaml(block)).data as Record<string, unknown>;
    expect(writeFrontMatter(fields)).toBe(block);
  });
});
