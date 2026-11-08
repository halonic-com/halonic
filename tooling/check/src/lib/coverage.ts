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
const fixedLayers: readonly Layer[] = ["core", "adapters", "host", "studio", "apps"];

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
    if (key !== "lines" && key !== "branches") {
      problems.push(`"halonic.coverage" takes only "lines" and "branches", not "${key}".`);
    }
  }
  const minimum = fixedLayers.includes(layer) ? defaultCoverageFloors[layer] : undefined;
  for (const key of ["lines", "branches"] as const) {
    const problem = percentProblem(key, floor[key], minimum?.[key], layer);
    if (problem !== undefined) {
      problems.push(problem);
    }
  }
  return problems;
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
  if (required !== undefined && percent < required) {
    return `"halonic.coverage.${key}" is ${percent}, below the ${required} that the ${layer} layer requires.`;
  }
  return undefined;
}
