import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { testSelection } from "../lib/affected-tests.ts";
import { findRepoRoot, listWorkspacePackages } from "../lib/workspace.ts";

/**
 * Prints which packages' tests a pull request needs, for CI's build job.
 *
 *   node tooling/check/src/cli/affected-tests.ts --base <commit>
 *     compares `<commit>...HEAD` and prints `all=true` with the reason, or
 *     `all=false` and `filters=` with one `--filter=<package>` per package
 *     (empty when no package's tests are needed)
 *
 * In Actions, `all` and `filters` also go to `$GITHUB_OUTPUT`.
 */

function output(line: string): void {
  console.log(line);
  const file = process.env["GITHUB_OUTPUT"];
  if (file !== undefined && file !== "") {
    appendFileSync(file, `${line}\n`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { base: { type: "string" } } });
  if (values.base === undefined || values.base === "") {
    console.error("affected-tests: pass --base <commit>.");
    process.exitCode = 2;
  } else {
    const root = findRepoRoot();
    const changed = execFileSync("git", ["diff", "--name-only", `${values.base}...HEAD`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const files = changed.split("\n").filter((file) => file !== "");
    const selection = testSelection(files, listWorkspacePackages(root));
    if (selection.kind === "all") {
      console.log(`  every package: ${selection.reason}`);
      output("all=true");
      output("filters=");
    } else {
      for (const name of selection.packages) {
        console.log(`  package: ${name}`);
      }
      output("all=false");
      output(`filters=${selection.packages.map((name) => `--filter=${name}`).join(" ")}`);
    }
  }
}
