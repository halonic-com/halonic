import type { Layer } from "./layout.ts";

/**
 * A package's coverage floor: the lowest share of its source lines (and
 * branches) its tests must run, in percent. It lives in the package's own
 * `package.json` as `"halonic": { "coverage": { ... } }` and may only go
 * up.
 */
export interface CoverageFloor {
  readonly lines: number;
  readonly branches?: number;
}

/** The floor `pnpm new` writes for a new package in each layer. */
export const defaultCoverageFloors: Readonly<Record<Layer, CoverageFloor>> = {
  core: { lines: 90, branches: 85 },
  adapters: { lines: 80 },
  host: { lines: 80 },
  targets: { lines: 80 },
  studio: { lines: 85 },
  apps: { lines: 80 },
  testing: { lines: 80 },
  tooling: { lines: 80 },
};

/**
 * The layers whose floor is fixed: a package there may not set a lower
 * one. The testing and tooling layers have no fixed number, so their packages
 * start from what they have and raise it.
 */
const fixedLayers: readonly Layer[] = ["core", "adapters", "host", "targets", "studio", "apps"];

/** Layers with no fixed number, where a floor of 0 would still switch the check off. */
const zeroNotAllowed: readonly Layer[] = ["testing", "tooling"];

function example(layer: Layer): string {
  const fields = Object.entries(defaultCoverageFloors[layer]).map(
    ([key, percent]) => `"${key}": ${percent}`,
  );
  return `"halonic": { "coverage": { ${fields.join(", ")} } }`;
}

/**
 * Checks the `halonic.coverage` field of a package in a layer.
 *
 * @returns one message per problem, empty when the floor is fine
 *
 * @example
 * coverageFloorProblems({ lines: 90, branches: 85 }, "core"); // []
 * coverageFloorProblems(undefined, "core"); // ['Set a coverage floor: ...']
 */
export function coverageFloorProblems(value: unknown, layer: Layer): string[] {
  if (value === undefined) {
    return [
      `Set a coverage floor: ${example(layer)} is the default for the ${layer} layer. Every package needs one.`,
    ];
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [`"halonic.coverage" must be an object such as ${example(layer)}.`];
  }
  const floor = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of Object.keys(floor)) {
    if (key !== "lines" && key !== "branches" && key !== "measuredIn") {
      problems.push(
        `"halonic.coverage" takes only "lines", "branches" and "measuredIn", not "${key}".`,
      );
    }
  }
  const minimum = fixedLayers.includes(layer) ? defaultCoverageFloors[layer] : undefined;
  for (const key of ["lines", "branches"] as const) {
    const problem = percentProblem(key, floor[key], minimum?.[key], layer);
    if (problem !== undefined) {
      problems.push(problem);
    }
  }
  if (floor["measuredIn"] !== undefined) {
    problems.push(...measuredInProblems(floor, layer));
  }
  return problems;
}

/**
 * `"measuredIn": "<package>"` moves a floor into another package's test run.
 * Only the testing layer may do that (its suites run inside the adapters),
 * and only with at least the layer's default, so it can't dodge the floor.
 */
function measuredInProblems(floor: Record<string, unknown>, layer: Layer): string[] {
  const measuredIn = floor["measuredIn"];
  if (layer !== "testing") {
    return [
      `"halonic.coverage.measuredIn" is only for the testing layer, whose suites run inside other packages. Measure this package in its own run.`,
    ];
  }
  if (typeof measuredIn !== "string" || measuredIn.trim() === "") {
    return [
      `"halonic.coverage.measuredIn" must name the package whose test run measures this one.`,
    ];
  }
  const required = defaultCoverageFloors.testing.lines;
  const lines = floor["lines"];
  if (typeof lines === "number" && lines < required) {
    return [
      `"halonic.coverage.lines" must be at least ${required} with "measuredIn": a floor measured elsewhere can't be lower than the default.`,
    ];
  }
  return [];
}

function percentProblem(
  key: "lines" | "branches",
  percent: unknown,
  required: number | undefined,
  layer: Layer,
): string | undefined {
  if (percent === undefined) {
    return key === "lines" || required !== undefined
      ? `"halonic.coverage" needs "${key}". ${example(layer)} is the default.`
      : undefined;
  }
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    return `"halonic.coverage.${key}" must be a percentage from 0 to 100.`;
  }
  if (percent === 0 && zeroNotAllowed.includes(layer)) {
    return `"halonic.coverage.${key}" can't be 0 in the ${layer} layer: a floor of 0 turns the check off. Set what the tests reach today and raise it.`;
  }
  if (required !== undefined && percent < required) {
    return `"halonic.coverage.${key}" is ${percent}, below the ${required} that the ${layer} layer requires.`;
  }
  return undefined;
}

/**
 * The `test` script of a package whose tests Turbo runs as parts at once
 * (`test:part-1`, `test:part-2`, …, HAL-17930): it merges the parts' blob
 * reports with `vitest.merge.config.ts`, which builds on the package's
 * `vitest.config.ts`, so the merged run checks the shared floor.
 */
export const mergedPartsTestScript =
  "vitest run --config vitest.merge.config.ts --merge-reports=test-results/blob";

const allowedTestScripts: readonly string[] = ["vitest run", mergedPartsTestScript];

/** The test files of a package, as the packages check reads them. */
export interface TestSetup {
  /** The `test` script from `package.json`. */
  testScript: unknown;
  /** The text of `vitest.config.ts`, or `undefined` when missing. */
  configText: string | undefined;
  /** The text of `vitest.merge.config.ts`, or `undefined` when missing. */
  mergeConfigText: string | undefined;
}

/**
 * Checks that a package's tests run through the shared Vitest preset with
 * coverage on, so its floor is enforced and can't be switched off. A package
 * whose tests run as parts is checked on its merge config too, since the
 * merge is the run whose floor counts.
 *
 * @param setup - the package's `test` script and Vitest config files
 * @returns one message per problem, empty when the setup is fine
 *
 * @example
 * testSetupProblems({
 *   testScript: "vitest run",
 *   configText: "export default definePackageTestConfig();",
 *   mergeConfigText: undefined,
 * }); // []
 */
export function testSetupProblems(setup: TestSetup): string[] {
  const { testScript, configText, mergeConfigText } = setup;
  const problems: string[] = [];
  if (typeof testScript !== "string" || !allowedTestScripts.includes(testScript.trim())) {
    problems.push(
      'The "test" script must be exactly "vitest run", or "' +
        mergedPartsTestScript +
        '" for tests split into parts: coverage and its floor come from the shared preset, so no flags such as --coverage.enabled=false.',
    );
  }
  problems.push(...packageConfigProblems(configText));
  if (typeof testScript === "string" && testScript.trim() === mergedPartsTestScript) {
    problems.push(...mergeConfigProblems(mergeConfigText));
  }
  return problems;
}

function packageConfigProblems(configText: string | undefined): string[] {
  if (configText === undefined) {
    return [
      'Add a vitest.config.ts with `export default definePackageTestConfig();` from "@halonicjs/tooling-config/vitest".',
    ];
  }
  if (!/\bdefinePackageTestConfig\(/.test(configText)) {
    return [
      "vitest.config.ts must build its config with definePackageTestConfig() from the shared preset.",
    ];
  }
  if (/\bcoverage\b|\bthresholds\b/.test(configText)) {
    return [
      'vitest.config.ts may not set "coverage" or "thresholds": the floor lives in package.json under halonic.coverage and may only go up.',
    ];
  }
  return [];
}

/**
 * The merge config of tests run as parts: it must build on the package's
 * `vitest.config.ts` and leave coverage as the preset sets it, so the merged
 * run checks the same floor as a whole run would.
 */
function mergeConfigProblems(mergeConfigText: string | undefined): string[] {
  if (mergeConfigText === undefined) {
    return [
      `Add a vitest.merge.config.ts that builds on vitest.config.ts: the "test" script "${mergedPartsTestScript}" runs it.`,
    ];
  }
  if (!/from\s+["']\.\/vitest\.config\.ts["']/.test(mergeConfigText)) {
    return [
      'vitest.merge.config.ts must build on the package\'s own config: import it from "./vitest.config.ts".',
    ];
  }
  if (/\bcoverage\b|\bthresholds\b/.test(mergeConfigText)) {
    return [
      'vitest.merge.config.ts may not set "coverage" or "thresholds": the merged run checks the floor from vitest.config.ts.',
    ];
  }
  return [];
}
