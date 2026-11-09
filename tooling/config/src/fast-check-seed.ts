import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The seed every fast-check property uses when `FAST_CHECK_SEED` isn't set. */
export const defaultFastCheckSeed = 20261107;

/**
 * The fast-check seed for a test run. A fixed seed makes every run check the
 * same inputs, so a test makes the same `expect` calls each time and the
 * requirement guard can compare the counts with the merge base.
 *
 * `FAST_CHECK_SEED` picks another seed, for example the one a failure printed,
 * or `random` for a new seed on every run.
 *
 * @param value - the `FAST_CHECK_SEED` environment variable
 * @returns the seed, or `undefined` for fast-check's own random seed
 *
 * @example
 * fastCheckSeed(undefined); // 20261107
 * fastCheckSeed("42"); // 42
 * fastCheckSeed("random"); // undefined
 */
export function fastCheckSeed(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return defaultFastCheckSeed;
  }
  if (value === "random") {
    return undefined;
  }
  const seed = Number(value);
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(seed)) {
    throw new Error(`FAST_CHECK_SEED must be a whole number or "random", not "${value}".`);
  }
  return seed;
}

/**
 * Whether a package uses fast-check, so its test run needs the seed set.
 *
 * @param directory - the package folder, where Vitest runs
 * @returns true when its `package.json` lists `fast-check`
 *
 * @example
 * usesFastCheck("packages/core/yaml"); // true
 */
export function usesFastCheck(directory: string): boolean {
  const path = join(directory, "package.json");
  if (!existsSync(path)) {
    return false;
  }
  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return (
    manifest.dependencies?.["fast-check"] !== undefined ||
    manifest.devDependencies?.["fast-check"] !== undefined
  );
}
