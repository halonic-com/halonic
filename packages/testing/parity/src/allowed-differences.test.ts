import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseAllowedDifferences, readAllowedDifferences } from "./allowed-differences.ts";

const file = fileURLToPath(new URL("../allowed-differences.json", import.meta.url));
const packagesFolder = fileURLToPath(new URL("../../..", import.meta.url));

/** The subfolders of a folder, as full paths. */
function subfolders(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(folder, entry.name));
}

/** The *.md file names in a folder, or none when the folder doesn't exist. */
function markdownFiles(folder: string): string[] {
  try {
    return readdirSync(folder).filter((entry) => entry.endsWith(".md"));
  } catch {
    return [];
  }
}

/** Adds the "# <id>" heading of each requirements/*.md file in a package to `ids`. */
function addRequirementIds(pkg: string, ids: Set<string>): void {
  const folder = join(pkg, "requirements");
  for (const name of markdownFiles(folder)) {
    const heading = /^# (\S+)/.exec(readFileSync(join(folder, name), "utf8"));
    if (heading?.[1]) ids.add(heading[1]);
  }
}

/** Every requirement ID in the repo, read from the "# <id>" heading of each requirements/*.md file. */
function requirementIds(): Set<string> {
  const ids = new Set<string>();
  for (const group of subfolders(packagesFolder)) {
    for (const pkg of subfolders(group)) addRequirementIds(pkg, ids);
  }
  return ids;
}

// Read once while the file loads, as fixtures.test.ts does: walking every package inside the
// test passed Vitest's 5 s limit on a slow disk under load.
const knownRequirements = requirementIds();

const difference = {
  id: "memory-run-store-expected-seq",
  requirement: "contracts.run-store",
  area: "memory RunStore: append",
  old: "appended any event",
  new: "checks expectedSeq",
  why: "two writers never interleave",
  status: "proposed",
};

verifies("parity.allowed-differences-checked", () => {
  it("reads a well-formed difference as it is", () => {
    expect(parseAllowedDifferences([difference])).toEqual([difference]);
  });

  it("refuses a difference without a requirement ID", () => {
    const { requirement: _, ...withoutRequirement } = difference;
    expect(() => parseAllowedDifferences([withoutRequirement])).toThrow(
      /allowed difference 1: "requirement" must be a non-empty string/,
    );
  });

  it("refuses a requirement ID without its package", () => {
    expect(() => parseAllowedDifferences([{ ...difference, requirement: "run-store" }])).toThrow(
      /requirement "run-store" must look like "package.name"/,
    );
  });

  it("refuses an empty explanation", () => {
    expect(() => parseAllowedDifferences([{ ...difference, why: "  " }])).toThrow(
      /"why" must be a non-empty string/,
    );
  });

  it("refuses an unknown status and names the allowed ones", () => {
    expect(() => parseAllowedDifferences([{ ...difference, status: "approved" }])).toThrow(
      /unknown status "approved" \(one of proposed, signed-off\)/,
    );
  });

  it("refuses an unknown field, so a misspelt one isn't silently dropped", () => {
    expect(() => parseAllowedDifferences([{ ...difference, reqirement: "x.y" }])).toThrow(
      /unknown field "reqirement"/,
    );
  });

  it("refuses an id used twice and names the second entry", () => {
    expect(() => parseAllowedDifferences([difference, difference])).toThrow(
      /allowed difference 2: id "memory-run-store-expected-seq" is used twice/,
    );
  });

  it("refuses a file that isn't a list", () => {
    expect(() => parseAllowedDifferences({ differences: [] })).toThrow(/must hold a list/);
  });

  it("accepts the package's own file", () => {
    const differences = readAllowedDifferences(file);
    expect(differences.map((entry) => entry.requirement)).toEqual([
      "contracts.definition-source",
      "contracts.blob-store",
      "contracts.run-store",
      "schema-kit.nesting-limit",
      "app.workspace-save",
      "app.workspace-undo",
      "app.workspace-save",
      "format.routine-mail-interval",
      "format.deployments-file",
      "format.skill-file",
      "format.skill-file",
      "routines.due",
      "routines.due",
      "routines.due",
      "routines.due",
      "routines.due",
      "routines.due",
      "yaml.position-of",
      "yaml.position-of",
      "yaml.position-of",
      "workspace.file-places",
      "routines.cron-rejects-bad-expressions",
    ]);
  });

  it("cites only requirements that exist", () => {
    for (const entry of readAllowedDifferences(file)) {
      expect(
        knownRequirements.has(entry.requirement),
        `${entry.id} cites ${entry.requirement}`,
      ).toBe(true);
    }
  });
});
