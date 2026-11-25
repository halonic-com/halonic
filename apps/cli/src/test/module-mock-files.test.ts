import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { filesWithModuleMocks } from "./module-mock-files.ts";

const packageRoot = join(import.meta.dirname, "..", "..");
const moduleMockCall = /\bvi\.(?:mock|doMock)\(/;

async function testFilesUsingModuleMocks(): Promise<string[]> {
  const entries = await readdir(join(packageRoot, "src"), { recursive: true });
  const testFiles = entries.filter((entry) => entry.endsWith(".test.ts"));
  const found: string[] = [];
  for (const file of testFiles) {
    const path = join(packageRoot, "src", file);
    if (moduleMockCall.test(await readFile(path, "utf8"))) {
      found.push(relative(packageRoot, path).split("\\").join("/"));
    }
  }
  return found.sort();
}

describe("filesWithModuleMocks", () => {
  // A file that mocks a module but shares the module cache passes or fails
  // depending on which file loaded the module first.
  it("lists exactly the CLI test files that mock a module", async () => {
    expect(await testFilesUsingModuleMocks()).toEqual([...filesWithModuleMocks].sort());
  });
});
