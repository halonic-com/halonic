import type { CheckContext } from "../lib/context.ts";
import type { Report } from "../lib/problems.ts";
import { checkAbsolutePaths } from "./absolute-paths.ts";
import { checkAdvisories } from "./advisories.ts";
import { checkAgentsMd } from "./agents-md.ts";
import { checkDco } from "./dco.ts";
import { checkDependencies } from "./dependencies.ts";
import { checkFeatures } from "./features.ts";
import { checkFileSize } from "./file-size.ts";
import { inactiveChecks, inactiveRule } from "./inactive-checks.ts";
import { checkLayers } from "./layers.ts";
import { checkLockfile } from "./lockfile.ts";
import { checkNames } from "./names.ts";
import { checkPackages } from "./packages.ts";
import { checkTrace } from "./trace.ts";

/** Every rule `pnpm check` runs, by name. */
export const rules: Readonly<Record<string, (context: CheckContext) => Report>> = {
  packages: checkPackages,
  "agents-md": checkAgentsMd,
  layers: checkLayers,
  dependencies: checkDependencies,
  advisories: (context) => checkAdvisories(context),
  names: checkNames,
  features: checkFeatures,
  "file-size": checkFileSize,
  lockfile: checkLockfile,
  "absolute-paths": checkAbsolutePaths,
  dco: (context) => checkDco(context),
  trace: checkTrace,
  ...Object.fromEntries(Object.keys(inactiveChecks).map((name) => [name, inactiveRule(name)])),
};

/**
 * Rules that read the tests' result files. Plain `pnpm check` runs before
 * the tests, so it leaves these out; they run only when named, after the
 * tests, as in `pnpm check trace`.
 */
export const rulesAfterTests: readonly string[] = ["trace"];

/**
 * The rules one `pnpm check` run covers: the named ones, or with no names
 * every rule except those in `rulesAfterTests`.
 */
export function selectRules(names: readonly string[]): string[] {
  const all = Object.keys(rules);
  if (names.length > 0) {
    return all.filter((name) => names.includes(name));
  }
  return all.filter((name) => !rulesAfterTests.includes(name));
}
