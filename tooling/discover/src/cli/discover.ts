import { findRepoRoot, formatProblem, loadContext, rules } from "@halonicjs/tooling-check";
import { fixFeatureList, generatedFeaturesFile, writeFeaturesFile } from "../features.ts";
import { readFolderDiscoveries } from "../folder-discovery.ts";
import { folderProblems, writeFolderFiles } from "../folder-files.ts";
import { fixTurboInputs, turboFile, turboProblems } from "../turbo.ts";

/**
 * pnpm discover            write the generated registration files (gitignored)
 * pnpm discover --fix      also rewrite the Studio's feature list in apps/studio/package.json
 *                          and add missing folder-discovery globs to turbo.json
 * pnpm discover --check    change nothing; fail if the feature list, a discovered
 *                          folder or turbo.json is out of date (CI)
 *
 * Turbo runs it before every typecheck, test and build.
 */
function main(argv: readonly string[]): number {
  const root = findRepoRoot();
  if (argv.includes("--check")) {
    const context = loadContext(root);
    const { discoveries, problems: declared } = readFolderDiscoveries(context);
    const problems = [
      ...(rules["features"]?.(context).problems ?? []),
      ...declared,
      ...folderProblems(context, discoveries),
      ...turboProblems(context, discoveries),
    ];
    for (const problem of problems) {
      console.log(formatProblem(problem));
    }
    console.log(
      `discover: generated files ${problems.length === 0 ? "up to date" : "out of date"}.`,
    );
    return problems.length === 0 ? 0 : 1;
  }
  if (argv.includes("--fix") && fixFeatureList(loadContext(root))) {
    console.log(
      "discover: updated the feature list in apps/studio/package.json. Run pnpm install.",
    );
  }
  const context = loadContext(root);
  const { discoveries, problems } = readFolderDiscoveries(context);
  for (const problem of problems) {
    console.log(formatProblem(problem));
  }
  if (argv.includes("--fix") && fixTurboInputs(context, discoveries)) {
    console.log(`discover: added folder-discovery globs to ${turboFile}.`);
  }
  if (writeFeaturesFile(context)) {
    console.log(`discover: wrote ${generatedFeaturesFile}.`);
  }
  for (const file of writeFolderFiles(context, discoveries)) {
    console.log(`discover: wrote ${file}.`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
