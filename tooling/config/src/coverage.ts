import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/** The coverage percentages a test run must reach, as Vitest takes them. */
export interface CoverageThresholds {
  readonly lines?: number;
  readonly branches?: number;
}

/**
 * Reads a package's coverage floor from `"halonic": { "coverage": { ... } }`
 * in its `package.json`, so each owner keeps it in their own file.
 * `pnpm check` makes sure every package has a valid one; here we only take
 * the numbers that are there.
 *
 * @param directory - the package folder, where Vitest runs
 * @returns the floor as Vitest thresholds, empty when there is none
 *
 * @example
 * readCoverageFloor("packages/core/std"); // { lines: 90, branches: 85 }
 */
export function readCoverageFloor(directory: string): CoverageThresholds {
  const path = join(directory, "package.json");
  if (!existsSync(path)) {
    return {};
  }
  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    halonic?: { coverage?: Record<string, unknown> };
  };
  const floor = manifest.halonic?.coverage ?? {};
  const thresholds: { lines?: number; branches?: number } = {};
  for (const key of ["lines", "branches"] as const) {
    const percent = floor[key];
    if (typeof percent === "number") {
      thresholds[key] = percent;
    }
  }
  return thresholds;
}

/** What one package's test run measures, and the floors it holds each folder to. */
export interface CoverageSettings {
  readonly include: string[];
  readonly exclude: string[];
  /** On when the run also measures another package's `src`, outside its own folder. */
  readonly allowExternal: boolean;
  /** One overall floor, or one floor per folder glob when the run measures another package. */
  readonly thresholds: CoverageThresholds | Record<string, CoverageThresholds>;
}

const sourceFiles = ["src/**/*.ts", "src/**/*.tsx"];
// Tests, test helpers and generated files aren't the code under test.
const notUnderTest = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "src/**/test/**",
  "src/generated/**",
];

interface Manifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  halonic?: { coverage?: Record<string, unknown> };
}

function readManifest(directory: string): Manifest {
  const path = join(directory, "package.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Manifest) : {};
}

/**
 * Works out what a package's test run measures. Normally that's its own
 * `src`, held to its own floor. A package can instead say its `src` is
 * measured in another package's run, with `"measuredIn": "<package>"` next
 * to its floor (the contract suites only run inside the adapters). Then the
 * other package's run also measures that `src`, and holds each folder to its
 * own floor, so neither number flatters the other. The package's own run
 * still runs its tests, without a floor.
 *
 * @param directory - the package folder, which is where Vitest runs
 * @returns the coverage settings for the package's run
 * @throws when a package measured here has no `src` folder, since its floor would measure nothing
 *
 * @example
 * coverageSettings("packages/adapters/memory").thresholds;
 * // { "src/**": { lines: 80 }, "../../testing/contracts/src/**": { lines: 80 } }
 */
export function coverageSettings(directory: string): CoverageSettings {
  const manifest = readManifest(directory);
  const ownFloor =
    typeof manifest.halonic?.coverage?.["measuredIn"] === "string"
      ? {}
      : readCoverageFloor(directory);
  const measured = measuredHere(directory, manifest);
  if (measured.length === 0) {
    return {
      include: sourceFiles,
      exclude: notUnderTest,
      allowExternal: false,
      thresholds: ownFloor,
    };
  }
  const thresholds: Record<string, CoverageThresholds> = { "src/**": ownFloor };
  const include = [...sourceFiles];
  const exclude = [...notUnderTest];
  for (const { folder, floor } of measured) {
    thresholds[`${folder}/src/**`] = floor;
    include.push(...sourceFiles.map((glob) => `${folder}/${glob}`));
    exclude.push(...notUnderTest.map((glob) => `${folder}/${glob}`));
  }
  return { include, exclude, allowExternal: true, thresholds };
}

/** The workspace dependencies whose `src` is measured in this package's run. */
function measuredHere(
  directory: string,
  manifest: Manifest,
): { folder: string; floor: CoverageThresholds }[] {
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  const measured: { folder: string; floor: CoverageThresholds }[] = [];
  for (const name of names) {
    const link = join(directory, "node_modules", name);
    if (manifest.name === undefined || !existsSync(link)) {
      continue;
    }
    // pnpm links workspace packages; Vitest sees their real path, so match that.
    const target = realpathSync(link);
    if (readManifest(target).halonic?.coverage?.["measuredIn"] !== manifest.name) {
      continue;
    }
    if (!existsSync(join(target, "src"))) {
      throw new Error(`${name} is measured in ${manifest.name}'s run, but has no src folder.`);
    }
    // Vitest matches floor globs against paths relative to its root, with forward slashes.
    const folder = relative(resolve(directory), target).split(sep).join("/");
    measured.push({ folder, floor: readCoverageFloor(target) });
  }
  return measured;
}
