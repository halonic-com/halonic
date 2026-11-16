import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkCloudBundle, type Metafile } from "../lib/bundle.ts";
import { loadBundleRules } from "../lib/bundle-rules.ts";
import type { Policy } from "../lib/context.ts";
import { formatAnnotation, formatProblem } from "../lib/problems.ts";
import { findRepoRoot, readJson } from "../lib/workspace.ts";

/**
 * pnpm check:bundle --target <cloud> <metafile> …
 *
 * Runs after each cloud runtime build. Reads the bundler's
 * metafile and fails when the bundle holds anything but our own code, the
 * provider's own code and the libraries marked `cloudRuntime` in
 * `tooling/check/dependencies.json`.
 */
function main(argv: readonly string[]): number {
  const targetAt = argv.indexOf("--target");
  const target = targetAt === -1 ? undefined : argv[targetAt + 1];
  const metafiles = argv.filter(
    (argument, index) => !argument.startsWith("-") && index !== targetAt + 1,
  );
  const root = findRepoRoot();
  const rules = target === undefined ? undefined : loadBundleRules(root, target);
  if (target === undefined || rules === undefined || metafiles.length === 0) {
    const targets = Object.keys(
      readJson<Policy>(join(root, "tooling/check/policy.json")).cloudRuntimes,
    ).join(", ");
    console.error(`Usage: pnpm check:bundle --target <${targets}> <metafile> …`);
    return 2;
  }
  const annotate = process.env["GITHUB_ACTIONS"] === "true";
  let errors = 0;
  for (const path of metafiles) {
    const metafile = JSON.parse(readFileSync(path, "utf8")) as Metafile;
    const problems = checkCloudBundle(metafile, path, rules);
    for (const problem of problems) {
      console.log(annotate ? formatAnnotation(problem) : formatProblem(problem));
    }
    errors += problems.length;
  }
  console.log(`check:bundle: ${errors} error(s) in ${metafiles.length} ${target} bundle(s).`);
  return errors === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
