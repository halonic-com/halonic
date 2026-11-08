import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AllowedFixture, readAllowedFixtures } from "./compare/allowed-fixtures.ts";

/** The statuses an allowed difference can have, in order. */
export const differenceStatuses = ["proposed", "signed-off"] as const;
/** "proposed" until the maintainer signs the difference off in review, then "signed-off". */
export type DifferenceStatus = (typeof differenceStatuses)[number];

/** One way the new repo is allowed to behave differently from the old one. */
export interface AllowedDifference {
  /** Stable kebab-case name of this difference, unique in the file. */
  readonly id: string;
  /** The requirement that explains the difference, for example "contracts.run-store". */
  readonly requirement: string;
  /** What the difference is about, in a few words. */
  readonly area: string;
  /** What the old repo (784f78d) did. */
  readonly old: string;
  /** What the new repo does instead. */
  readonly new: string;
  /** Why the new behaviour is right. */
  readonly why: string;
  readonly status: DifferenceStatus;
  /**
   * The parity fixture files this difference shows in, each with its old and
   * new result in full. Left out when the fixtures don't reach it.
   */
  readonly fixtures?: readonly AllowedFixture[];
}

/** The package's own allowed-differences file. */
export const allowedDifferencesFile = fileURLToPath(
  new URL("../allowed-differences.json", import.meta.url),
);

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A requirement ID: the package's short name, a dot, and the requirement's kebab-case name. */
const requirementPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fields = ["id", "requirement", "area", "old", "new", "why", "status", "fixtures"] as const;

function text(entry: Record<string, unknown>, field: string, where: string): string {
  const value = entry[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${where}: "${field}" must be a non-empty string`);
  }
  return value;
}

function readEntry(raw: unknown, where: string): AllowedDifference {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${where}: each difference must be an object`);
  }
  const entry = raw as Record<string, unknown>;
  const unknown = Object.keys(entry).filter((key) => !(fields as readonly string[]).includes(key));
  if (unknown.length > 0) {
    throw new Error(`${where}: unknown field "${unknown[0]}" (fields: ${fields.join(", ")})`);
  }
  const id = text(entry, "id", where);
  if (!idPattern.test(id)) {
    throw new Error(`${where}: id "${id}" must be kebab-case`);
  }
  const requirement = text(entry, "requirement", where);
  if (!requirementPattern.test(requirement)) {
    throw new Error(`${where}: requirement "${requirement}" must look like "package.name"`);
  }
  const status = text(entry, "status", where);
  if (!(differenceStatuses as readonly string[]).includes(status)) {
    throw new Error(
      `${where}: unknown status "${status}" (one of ${differenceStatuses.join(", ")})`,
    );
  }
  const difference: AllowedDifference = {
    id,
    requirement,
    area: text(entry, "area", where),
    old: text(entry, "old", where),
    new: text(entry, "new", where),
    why: text(entry, "why", where),
    status: status as DifferenceStatus,
  };
  return entry["fixtures"] === undefined
    ? difference
    : { ...difference, fixtures: readAllowedFixtures(entry["fixtures"], where) };
}

/**
 * Checks the allowed differences and returns them. Throws naming the entry
 * when one is malformed or an id repeats, so a difference is never allowed by
 * a typo.
 */
export function parseAllowedDifferences(raw: unknown): AllowedDifference[] {
  if (!Array.isArray(raw)) {
    throw new Error("allowed differences: the file must hold a list");
  }
  const seen = new Set<string>();
  const seenFixtures = new Set<string>();
  return raw.map((item, index) => {
    const difference = readEntry(item, `allowed difference ${index + 1}`);
    if (seen.has(difference.id)) {
      throw new Error(`allowed difference ${index + 1}: id "${difference.id}" is used twice`);
    }
    seen.add(difference.id);
    for (const fixture of difference.fixtures ?? []) {
      const name = `${fixture.case}: ${fixture.file}`;
      if (seenFixtures.has(name)) {
        throw new Error(`allowed difference ${index + 1}: fixture "${name}" is listed twice`);
      }
      seenFixtures.add(name);
    }
    return difference;
  });
}

/** Reads and checks an allowed-differences file. */
export function readAllowedDifferences(file: string): AllowedDifference[] {
  return parseAllowedDifferences(JSON.parse(readFileSync(file, "utf8")));
}
