import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { selectedFolders, selectTests } from "../lib/affected-tests.ts";
import { loadContext } from "../lib/context.ts";
import { findRepoRoot } from "../lib/workspace.ts";

/**
 * Prints which packages' tests a pull request needs, for CI's build job,
 * the merge base's tests and the guard job.
 *
 *   node tooling/check/src/cli/affected-tests.ts --base <commit> [--head <commit>]
 *     compares `<base>...<head>` (`HEAD` by default) and prints `all=true`
 *     with the reason, or `all=false`, `filters=` with one
 *     `--filter=<package>` per package and `folders=` with their folders
 *     (both empty when no package's tests are needed)
 *
 * The packages come from the current checkout, which can be another commit
 * than `--head`: the merge base's tests run it on the merge base. In
 * Actions, `all`, `filters` and `folders` also go to `$GITHUB_OUTPUT`.
 */

function output(line: string): void {
  console.log(line);
  const file = process.env["GITHUB_OUTPUT"];
  if (file !== undefined && file !== "") {
    appendFileSync(file, `${line}\n`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { base: { type: "string" }, head: { type: "string" } },
  });
  if (values.base === undefined || values.base === "") {
    console.error("affected-tests: pass --base <commit>.");
    process.exitCode = 2;
  } else {
    const context = loadContext(findRepoRoot());
    const selection = selectTests(context, values.base, values.head ?? "HEAD");
    const folders = selectedFolders(selection, context.packages);
    if (selection.kind === "all" || folders === undefined) {
      console.log(`  every package: ${selection.kind === "all" ? selection.reason : ""}`);
      output("all=true");
      output("filters=");
      output("folders=");
    } else {
      for (const name of selection.packages) {
        console.log(`  package: ${name}`);
      }
      output("all=false");
      output(`filters=${selection.packages.map((name) => `--filter=${name}`).join(" ")}`);
      output(`folders=${[...folders].sort().join(" ")}`);
    }
  }
}
