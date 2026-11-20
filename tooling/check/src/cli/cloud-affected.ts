import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { cloudAffectedFiles, inputsHash, liveInputPaths } from "../lib/cloud-paths.ts";
import { findRepoRoot, listRepoFiles, listWorkspacePackages } from "../lib/workspace.ts";

/**
 * Decides whether a change needs the live cloud suites (ADR 5.9), for the
 * `live-cloud` workflow and the merge queue's `live-cloud` gate in ci.yml.
 *
 *   node tooling/check/src/cli/cloud-affected.ts --base <commit>
 *     prints the changed cloud paths and `affected=true|false`
 *   node tooling/check/src/cli/cloud-affected.ts --inputs-hash
 *     prints `inputs=<hash>` of everything a live result depends on, so an
 *     earlier passing run with the same hash can be reused
 *
 * In Actions both lines also go to `$GITHUB_OUTPUT`.
 */

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * The cloud paths that `HEAD` changes since its merge base with `base`. A
 * moved file counts by both its old and its new path, so moving a file out
 * of a cloud path still counts as a cloud change.
 */
export function cloudPathsChangedSince(root: string, base: string): string[] {
  const changed = git(root, ["diff", "--name-only", "--no-renames", `${base}...HEAD`]).split("\n");
  return cloudAffectedFiles(changed.filter((file) => file !== ""));
}

function output(line: string): void {
  console.log(line);
  const file = process.env["GITHUB_OUTPUT"];
  if (file !== undefined && file !== "") {
    appendFileSync(file, `${line}\n`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { base: { type: "string" }, "inputs-hash": { type: "boolean" } },
  });
  const root = findRepoRoot();
  if (values["inputs-hash"] === true) {
    const inputs = liveInputPaths(listRepoFiles(root), listWorkspacePackages(root));
    const tree = git(root, ["ls-tree", "-r", "HEAD", "--", ...inputs]).split("\n");
    output(`inputs=${inputsHash(tree.filter((line) => line !== ""))}`);
  } else if (values.base === undefined || values.base === "") {
    console.error("cloud-affected: pass --base <commit> or --inputs-hash.");
    process.exitCode = 2;
  } else {
    const affected = cloudPathsChangedSince(root, values.base);
    for (const file of affected) {
      console.log(`  cloud path: ${file}`);
    }
    output(`affected=${affected.length > 0}`);
  }
}
