import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The packages the nightly run mutates: the workflow rules,
 * routines and the two new parsers. `engine` joins once it exists.
 */
export const mutationTargets: readonly string[] = [
  "packages/core/workflow",
  "packages/core/routines",
  "packages/core/schema-kit",
  "packages/core/yaml",
];

function isTest(file: string): boolean {
  return /\.test\.tsx?$/.test(file) || file.split("/").includes("test");
}

function sourceFiles(directory: string, root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path, root));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(relative(root, path).split("\\").join("/"));
    }
  }
  return files;
}

/**
 * True when a package has code worth mutating: a source file under `src`
 * other than its tests and `src/index.ts`. A new package from `pnpm new`
 * only has the placeholder `index.ts`, and a real package keeps its code
 * in other files, so `index.ts` alone never counts.
 */
export function hasCode(packageDirectory: string): boolean {
  let files: string[];
  try {
    files = sourceFiles(join(packageDirectory, "src"), packageDirectory);
  } catch {
    return false;
  }
  return files.some((file) => file !== "src/index.ts" && !isTest(file));
}

/** Where one Stryker run reads its plugin and writes its files. */
export interface StrykerPaths {
  /** The absolute path of `@stryker-mutator/vitest-runner`'s entry file. */
  readonly vitestRunner: string;
  /** Where the JSON report goes. */
  readonly report: string;
  /** Stryker's own working folder, outside the repo. */
  readonly sandbox: string;
}

/** The Stryker config for one package, run from that package's folder. */
export function strykerConfig(paths: StrykerPaths): Record<string, unknown> {
  return {
    testRunner: "vitest",
    // With pnpm, Stryker can't find the runner next to itself; name it.
    plugins: [paths.vitestRunner],
    vitest: { configFile: "vitest.config.ts" },
    mutate: ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.ts", "!src/**/*.test.tsx"],
    // Stryker rewrites tsconfig.json with the TypeScript 5 API, which
    // TypeScript 7 doesn't have. Vitest doesn't read tsconfig, so we
    // point Stryker at a file that doesn't exist and it skips the step.
    tsconfigFile: "stryker-reads-no-tsconfig.json",
    reporters: ["json", "clear-text"],
    jsonReporter: { fileName: paths.report },
    tempDirName: paths.sandbox,
    cleanTempDir: true,
    incremental: false,
    timeoutMS: 10_000,
  };
}
