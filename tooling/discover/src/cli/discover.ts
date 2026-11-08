import { findRepoRoot, formatProblem, loadContext, rules } from "@halonicjs/tooling-check";
import { fixFeatureList, generatedFeaturesFile, writeFeaturesFile } from "../features.ts";

/**
 * pnpm discover            write the generated registration files (gitignored)
 * pnpm discover --fix      also rewrite the Studio's feature list in apps/studio/package.json
 * pnpm discover --check    change nothing; fail if the feature list is out of date (CI)
 *
 * Turbo runs it before every typecheck, test and build (plan 5.3).
 */
function main(argv: readonly string[]): number {
  const root = findRepoRoot();
  if (argv.includes("--check")) {
    const problems = rules["features"]?.(loadContext(root)).problems ?? [];
    for (const problem of problems) {
      console.log(formatProblem(problem));
    }
    console.log(`discover: feature list ${problems.length === 0 ? "up to date" : "out of date"}.`);
    return problems.length === 0 ? 0 : 1;
  }
  if (argv.includes("--fix") && fixFeatureList(loadContext(root))) {
    console.log(
      "discover: updated the feature list in apps/studio/package.json. Run pnpm install.",
    );
  }
  if (writeFeaturesFile(loadContext(root))) {
    console.log(`discover: wrote ${generatedFeaturesFile}.`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
