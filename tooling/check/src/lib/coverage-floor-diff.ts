import type { CoverageFloor } from "./coverage.ts";

/** The label that allows a pull request to lower a coverage floor. */
export const lowerFloorLabel = "coverage-floor-lowered";

/** Each package's floor, keyed by the path of its `package.json`. */
export type FloorsByManifest = ReadonlyMap<string, Partial<CoverageFloor>>;

/** One floor value that is lower than on the target branch. */
export interface LoweredFloor {
  readonly manifest: string;
  readonly key: "lines" | "branches";
  readonly before: number;
  readonly after: number | undefined;
}

/**
 * Reads `halonic.coverage` out of a `package.json` text. Anything that isn't
 * a number is left out: the floor check reports malformed values.
 *
 * @returns `undefined` when the package has no floor
 */
export function readFloor(manifestText: string): Partial<CoverageFloor> | undefined {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return undefined;
  }
  const coverage = (manifest as { halonic?: { coverage?: unknown } } | null)?.halonic?.coverage;
  if (coverage === null || typeof coverage !== "object" || Array.isArray(coverage)) {
    return undefined;
  }
  const { lines, branches } = coverage as Record<string, unknown>;
  return {
    ...(typeof lines === "number" ? { lines } : {}),
    ...(typeof branches === "number" ? { branches } : {}),
  };
}

/**
 * Compares the floors in a pull request with the target branch's. A value
 * that is missing or smaller than before counts as lowered. New packages,
 * deleted packages and packages with no floor on the target are fine.
 *
 * @example
 * loweredFloors(new Map([["a/package.json", { lines: 90 }]]), new Map([["a/package.json", { lines: 85 }]]));
 * // [{ manifest: "a/package.json", key: "lines", before: 90, after: 85 }]
 */
export function loweredFloors(base: FloorsByManifest, head: FloorsByManifest): LoweredFloor[] {
  const lowered: LoweredFloor[] = [];
  for (const [manifest, before] of base) {
    const after = head.get(manifest);
    if (after === undefined) {
      continue;
    }
    for (const key of ["lines", "branches"] as const) {
      const was = before[key];
      if (was !== undefined && (after[key] === undefined || after[key] < was)) {
        lowered.push({ manifest, key, before: was, after: after[key] });
      }
    }
  }
  return lowered;
}

/** The failure message: what went down, and how to allow it on purpose. */
export function loweredFloorMessage(lowered: readonly LoweredFloor[]): string {
  const lines = lowered.map(
    ({ manifest, key, before, after }) =>
      `  ${manifest}: halonic.coverage.${key} went from ${before} to ${after ?? "nothing"}`,
  );
  return [
    "coverage-floors: this pull request lowers a coverage floor:",
    ...lines,
    "Raise the floor again, or add tests so it can stay. If lowering it is deliberate,",
    `ask the maintainer (Liam) to add the "${lowerFloorLabel}" label to this pull request; the check then passes.`,
  ].join("\n");
}
