import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCoveredTestWorker, buildTestWorker } from "./build-test-worker.ts";
import { mapToSourceFiles, type SourceCoverage, writeWorkerdCoverage } from "./workerd-coverage.ts";
import { WorkerdRunner } from "./workerd-runner.ts";

const helperSource = `export function pick(count: number): string {
  if (count > 1) {
    return "big";
  }
  return "small";
}

export function neverCalled(): string {
  return "never";
}
`;

const suiteSource = [
  'import { expect, it } from "vitest";',
  'import { neverCalled, pick } from "./helper.ts";',
  'it("picks", () => {',
  '  expect(pick(5)).toBe("big");',
  '  if (pick(5) === "nothing") {',
  "    neverCalled();",
  "  }",
  "});",
].join("\n");

/** The text of every range of the file that was counted `count` times. */
function textCounted(file: SourceCoverage, text: string, count: number): string[] {
  return file.functions
    .flatMap((fn) => fn.ranges)
    .filter((range) => range.count === count)
    .map((range) => text.slice(range.startOffset, range.endOffset));
}

describe("workerd coverage", () => {
  let folder = "";

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "acme-workerd-coverage-"));
    await writeFile(path.join(folder, "helper.ts"), helperSource);
    await writeFile(path.join(folder, "suite.ts"), suiteSource);
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  async function coverageOfSuite(): Promise<SourceCoverage[]> {
    const build = await buildCoveredTestWorker([path.join(folder, "suite.ts")]);
    const runner = await WorkerdRunner.start(build.script, {}, { coverage: true });
    try {
      expect(await runner.run("1")).toMatchObject({ status: "passed" });
      return await mapToSourceFiles(await runner.coverage(), build);
    } finally {
      await runner.stop();
    }
  }

  it("maps what ran in workerd back to the lines of the source files", async () => {
    const files = await coverageOfSuite();
    const helper = files.find(
      (file) => file.url === pathToFileURL(path.join(folder, "helper.ts")).href,
    );
    expect(helper).toBeDefined();
    if (helper === undefined) {
      return;
    }
    const notRun = textCounted(helper, helperSource, 0).join("\n");
    expect(notRun).toContain('return "small";');
    expect(notRun).toContain("neverCalled");
    expect(notRun).not.toContain('return "big";');
    expect(textCounted(helper, helperSource, 1).join("\n")).toContain("pick");
  });

  it("counts the top-level code of every file that loaded, even one with no function inside", async () => {
    await writeFile(path.join(folder, "constants.ts"), 'export const answer = "forty-two";\n');
    await writeFile(
      path.join(folder, "suite.ts"),
      `import { answer } from "./constants.ts";\n${suiteSource}\nit("keeps the constant", () => expect(answer).toBe("forty-two"));\n`,
    );
    const files = await coverageOfSuite();
    const constants = files.find((file) => file.url.endsWith("/constants.ts"));
    expect(constants?.functions[0]?.ranges[0]).toMatchObject({ startOffset: 0, count: 1 });
  });

  it("has no coverage to give from a Worker that wasn't built for it", async () => {
    const runner = await WorkerdRunner.start(
      await buildTestWorker([path.join(folder, "suite.ts")]),
    );
    try {
      await expect(runner.coverage()).rejects.toThrow("not built for coverage");
    } finally {
      await runner.stop();
    }
  });

  it("writes one file per run for the coverage provider to read", async () => {
    const coverage = [
      {
        scriptId: "0",
        url: "file:///a.ts",
        startOffset: 0,
        isExtendedContext: true,
        functions: [],
      },
    ] as const;
    await writeWorkerdCoverage(path.join(folder, "out"), coverage);
    await writeWorkerdCoverage(path.join(folder, "out"), coverage);
    const names = await readdir(path.join(folder, "out"));
    expect(names).toHaveLength(2);
    const first = await readFile(path.join(folder, "out", names[0] ?? ""), "utf8");
    expect(JSON.parse(first)).toEqual({ result: coverage });
  });
});
