import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
