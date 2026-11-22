import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createVitest, startVitest } from "vitest/node";
import workerdCoverageModule, { workerdCoverageDirVariable } from "./workerd-coverage-provider.ts";

const providerPath = join(import.meta.dirname, "workerd-coverage-provider.ts");

/** A source file no test in the throwaway package imports, as if only workerd ran it. */
interface SourceFile {
  readonly name: string;
  readonly text: string;
  /** The statement workerd didn't run. */
  readonly uncovered: string;
}

const typeScript: SourceFile = {
  name: "shape.ts",
  text: `export function pick(count: number): string {
  if (count > 1) {
    return "big";
  }
  return "small";
}
`,
  uncovered: 'return "small";',
};

/** The same with JSX and a type-only import, which a plain JavaScript parser can't read. */
const typeScriptWithJsx: SourceFile = {
  name: "badge.tsx",
  text: `import type { ReactElement } from "react";
export function badge(count: number): ReactElement {
  if (count > 1) {
    return <b title={String(count)}>{count} big</b>;
  }
  return <i>small</i>;
}
`,
  uncovered: "return <i>small</i>;",
};

/**
 * What a workerd run leaves for the provider: V8 coverage of the source in
 * offsets into its own text, saying the function ran and the last return didn't.
 */
function workerdCoverage(file: string, { text: source, uncovered }: SourceFile): string {
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
function testThatLeavesCoverage(file: string, source: SourceFile): string {
  return [
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'import { expect, it } from "vitest";',
    'it("leaves the coverage of a workerd run", () => {',
    `  const directory = process.env[${JSON.stringify(workerdCoverageDirVariable)}] ?? "";`,
    "  mkdirSync(directory, { recursive: true });",
    `  writeFileSync(join(directory, "coverage-test.json"), ${JSON.stringify(workerdCoverage(file, source))});`,
    '  expect(directory).not.toBe("");',
    "});",
  ].join("\n");
}

interface FileCoverage {
  readonly statementMap: Record<string, { start: { line: number } }>;
  readonly s: Record<string, number>;
}

/** Runs the provider on a throwaway package and returns what the report says about the source file. */
async function reportedFor(
  source: SourceFile,
): Promise<{ hitLines: number[]; missedLines: number[] }> {
  const root = mkdtempSync(join(tmpdir(), "halonic-workerd-coverage-"));
  try {
    mkdirSync(join(root, "src"));
    const file = join(root, "src", source.name);
    writeFileSync(file, source.text);
    writeFileSync(join(root, "src", "source.test.ts"), testThatLeavesCoverage(file, source));
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    const vitest = await startVitest("test", [], {
      root,
      watch: false,
      reporters: [],
      coverage: {
        enabled: true,
        provider: "custom",
        customProviderModule: providerPath,
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.ts"],
        reporter: ["json"],
        reportsDirectory: join(root, "coverage"),
      },
    });
    await vitest.close();
    const report = JSON.parse(
      readFileSync(join(root, "coverage", "coverage-final.json"), "utf8"),
    ) as Record<string, FileCoverage>;
    const entry = Object.entries(report).find(([name]) => name.endsWith(source.name))?.[1];
    if (entry === undefined) {
      throw new Error(`The report has no src/${source.name}: ${Object.keys(report).join(", ")}`);
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

/**
 * Runs the provider's own code in this process, where this package's coverage sees it (a Vitest
 * run started by a test loads the provider through its own module runner, which it doesn't).
 */
async function reportedByProviderInThisProcess(source: SourceFile): Promise<number[]> {
  const root = mkdtempSync(join(tmpdir(), "halonic-workerd-coverage-"));
  const previous = process.env[workerdCoverageDirVariable];
  try {
    mkdirSync(join(root, "src"));
    const file = join(root, "src", source.name);
    writeFileSync(file, source.text);
    writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
    const vitest = await createVitest("test", {
      root,
      watch: false,
      reporters: [],
      coverage: {
        enabled: true,
        provider: "custom",
        customProviderModule: providerPath,
        include: ["src/**/*.{ts,tsx}"],
        reportsDirectory: join(root, "coverage"),
      },
    });
    const provider = (await workerdCoverageModule.getProvider()) as unknown as {
      initialize(ctx: unknown): void;
      generateCoverage(context: { allTestsRun: boolean }): Promise<{
        fileCoverageFor(file: string): { toJSON(): FileCoverage };
      }>;
    };
    provider.initialize(vitest);
    const directory = process.env[workerdCoverageDirVariable] ?? "";
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "coverage-test.json"), workerdCoverage(file, source));
    const map = await provider.generateCoverage({ allTestsRun: true });
    await vitest.close();
    const report = map.fileCoverageFor(file).toJSON();
    return Object.entries(report.s)
      .filter(([, count]) => count === 0)
      .map(([id]) => report.statementMap[id]?.start.line ?? 0);
  } finally {
    if (previous === undefined) {
      delete process.env[workerdCoverageDirVariable];
    } else {
      process.env[workerdCoverageDirVariable] = previous;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

describe("the workerd coverage provider", () => {
  it("adds what workerd counted to the report of a file no Node test loaded", async () => {
    const { hitLines, missedLines } = await reportedFor(typeScript);
    expect(hitLines).toContain(3);
    expect(missedLines).toEqual([5]);
  }, 60_000);

  it("reads a .tsx source, with JSX and a type-only import, at workerd's offsets", async () => {
    const { hitLines, missedLines } = await reportedFor(typeScriptWithJsx);
    expect(hitLines).toEqual(expect.arrayContaining([3, 4]));
    expect(missedLines).toEqual([6]);
  }, 60_000);

  it("gives the same report when its own code runs in this process", async () => {
    expect(await reportedByProviderInThisProcess(typeScript)).toEqual([5]);
    expect(await reportedByProviderInThisProcess(typeScriptWithJsx)).toEqual([6]);
  }, 60_000);

  it("clears what an earlier run left in the workerd folder, even with clean off", async () => {
    const root = mkdtempSync(join(tmpdir(), "halonic-workerd-coverage-"));
    const previous = process.env[workerdCoverageDirVariable];
    try {
      const vitest = await createVitest("test", {
        root,
        watch: false,
        reporters: [],
        coverage: {
          enabled: true,
          clean: false,
          provider: "custom",
          customProviderModule: providerPath,
          reportsDirectory: join(root, "coverage"),
        },
      });
      const provider = (await workerdCoverageModule.getProvider()) as unknown as {
        initialize(ctx: unknown): void;
        clean(clean?: boolean): Promise<void>;
      };
      provider.initialize(vitest);
      const directory = process.env[workerdCoverageDirVariable] ?? "";
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "coverage-left-behind.json"),
        workerdCoverage("left.ts", typeScript),
      );

      await provider.clean(false);
      await vitest.close();

      expect(existsSync(directory)).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env[workerdCoverageDirVariable];
      } else {
        process.env[workerdCoverageDirVariable] = previous;
      }
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("is a Vitest coverage module that starts and takes coverage like the V8 one", () => {
    expect(workerdCoverageModule.startCoverage).toBeTypeOf("function");
    expect(workerdCoverageModule.takeCoverage).toBeTypeOf("function");
    expect(workerdCoverageModule.stopCoverage).toBeTypeOf("function");
    expect(workerdCoverageModule.getProvider).toBeTypeOf("function");
  });
});
