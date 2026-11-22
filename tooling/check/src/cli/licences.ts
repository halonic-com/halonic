import { execFileSync } from "node:child_process";
import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import {
  emptyListingProblem,
  findLicenceProblems,
  findVendoredProblems,
  type InstalledPackage,
  type LicencePolicy,
  parseLicenceListing,
} from "../lib/licences.ts";
import { findRepoRoot, listRepoFiles, readJson } from "../lib/workspace.ts";

/**
 * pnpm check:licences
 *
 * Compares every installed package's licence with the allow-lists in
 * `tooling/check/licences.json`: production dependencies against
 * the shipped list, everything else against the wider dev-tooling list.
 * Also fails on a file under `packages/` or `apps/` whose header names a
 * third-party licence and isn't on the `vendored` list.
 */

function listInstalled(root: string, production: boolean): InstalledPackage[] {
  const args = ["--recursive", "licenses", "list", "--json", ...(production ? ["--prod"] : [])];
  const output = execFileSync("pnpm", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseLicenceListing(output);
}

/** The start of a file, enough for its licence header. */
function readHead(path: string): string {
  const buffer = Buffer.alloc(8192);
  const fd = openSync(path, "r");
  try {
    return buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
}

function main(): number {
  const root = findRepoRoot();
  const policy = readJson<LicencePolicy>(join(root, "tooling/check/licences.json"));
  const shipped = listInstalled(root, true);
  const shippedNames = new Set(shipped.map((pkg) => pkg.name));
  const all = listInstalled(root, false);
  const devOnly = all.filter((pkg) => !shippedNames.has(pkg.name));
  const empty = emptyListingProblem(all);
  const problems = [
    ...(empty === undefined ? [] : [empty]),
    ...findLicenceProblems(shipped, policy, "shipped"),
    ...findLicenceProblems(devOnly, policy, "dev"),
    ...findVendoredProblems(listRepoFiles(root), (file) => readHead(join(root, file)), policy),
  ];
  const annotate = process.env["GITHUB_ACTIONS"] === "true";
  for (const problem of problems) {
    console.log(annotate ? `::error title=licences::${problem}` : `error [licences] ${problem}`);
  }
  console.log(
    `licences: ${problems.length} problem(s) in ${shipped.length} shipped and ${devOnly.length} dev-only packages and ${policy.vendored?.length ?? 0} vendored file(s).`,
  );
  return problems.length === 0 ? 0 : 1;
}

process.exitCode = main();
