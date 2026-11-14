import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { startVitest } from "vitest/node";
import workerdCoverageModule, { workerdCoverageDirVariable } from "./workerd-coverage-provider.ts";

const providerPath = join(import.meta.dirname, "workerd-coverage-provider.ts");

/** A source file no test in the throwaway package imports, as if only workerd ran it. */
const source = `export function pick(count: number): string {
  if (count > 1) {
    return "big";
  }
  return "small";
}
`;

/**
 * What a workerd run leaves for the provider: V8 coverage of `source` in
 * offsets into its own text, saying the function ran and the last return didn't.
 */
function workerdCoverage(file: string): string {
  const uncovered = 'return "small";';
  const start = source.indexOf(uncovered);
  return JSON.stringify({
    result: [
      {
        scriptId: "0",
        url: pathToFileURL(file).href,
        startOffset: 0,
        isExtendedContext: true,
        functions: [
          {
            functionName: "pick",
            isBlockCoverage: true,
            ranges: [
              { startOffset: 0, endOffset: source.length - 1, count: 1 },
              { startOffset: start, endOffset: start + uncovered.length, count: 0 },
            ],
          },
        ],
      },
    ],
  });
}

/** The test file of the throwaway package: it leaves the coverage the way the workerd runner does. */
function testThatLeavesCoverage(file: string): string {
  return [
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'import { expect, it } from "vitest";',
    'it("leaves the coverage of a workerd run", () => {',
    `  const directory = process.env[${JSON.stringify(workerdCoverageDirVariable)}] ?? "";`,
    "  mkdirSync(directory, { recursive: true });",
    `  writeFileSync(join(directory, "coverage-test.json"), ${JSON.stringify(workerdCoverage(file))});`,
    '  expect(directory).not.toBe("");',
    "});",
  ].join("\n");
}

interface FileCoverage {
  readonly statementMap: Record<string, { start: { line: number } }>;
  readonly s: Record<string, number>;
}

/** Runs the provider on a throwaway package and returns what the report says about `src/shape.ts`. */
async function reportedForShape(): Promise<{ hitLines: number[]; missedLines: number[] }> {
  const root = mkdtempSync(join(tmpdir(), "halonic-workerd-coverage-"));
  try {
    mkdirSync(join(root, "src"));
    const shape = join(root, "src", "shape.ts");
    writeFileSync(shape, source);
    writeFileSync(join(root, "src", "shape.test.ts"), testThatLeavesCoverage(shape));
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    const vitest = await startVitest("test", [], {
      root,
      watch: false,
      reporters: [],
      coverage: {
        enabled: true,
        provider: "custom",
        customProviderModule: providerPath,
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.test.ts"],
        reporter: ["json"],
        reportsDirectory: join(root, "coverage"),
      },
    });
    await vitest.close();
    const report = JSON.parse(
      readFileSync(join(root, "coverage", "coverage-final.json"), "utf8"),
    ) as Record<string, FileCoverage>;
    const entry = Object.entries(report).find(([name]) => name.endsWith("shape.ts"))?.[1];
    if (entry === undefined) {
      throw new Error(`The report has no src/shape.ts: ${Object.keys(report).join(", ")}`);
    }
    const lines = (wanted: (count: number) => boolean): number[] =>
      Object.entries(entry.s)
        .filter(([, count]) => wanted(count))
        .map(([id]) => entry.statementMap[id]?.start.line ?? 0);
    return { hitLines: lines((count) => count > 0), missedLines: lines((count) => count === 0) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("the workerd coverage provider", () => {
  it("adds what workerd counted to the report of a file no Node test loaded", async () => {
    const { hitLines, missedLines } = await reportedForShape();
    expect(hitLines).toContain(3);
    expect(missedLines).toEqual([5]);
  }, 60_000);

  it("is a Vitest coverage module that starts and takes coverage like the V8 one", () => {
    expect(workerdCoverageModule.startCoverage).toBeTypeOf("function");
    expect(workerdCoverageModule.takeCoverage).toBeTypeOf("function");
    expect(workerdCoverageModule.stopCoverage).toBeTypeOf("function");
    expect(workerdCoverageModule.getProvider).toBeTypeOf("function");
  });
});
