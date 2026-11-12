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
    const changed = git(root, ["diff", "--name-only", `${values.base}...HEAD`]).split("\n");
    const affected = cloudAffectedFiles(changed.filter((file) => file !== ""));
    for (const file of affected) {
      console.log(`  cloud path: ${file}`);
    }
    output(`affected=${affected.length > 0}`);
  }
}
