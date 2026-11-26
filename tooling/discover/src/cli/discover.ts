import {
  type CheckContext,
  findRepoRoot,
  formatProblem,
  loadContext,
  rules,
} from "@halonicjs/tooling-check";
import { actionRoutesFile, writeActionRoutes } from "../action-routes.ts";
import { writeCatalogFiles } from "../catalog-files.ts";
import { fixFeatureList, generatedFeaturesFile, writeFeaturesFile } from "../features.ts";
import { type FolderDiscovery, readFolderDiscoveries } from "../folder-discovery.ts";
import { folderProblems, writeFolderFiles } from "../folder-files.ts";
import { fixTurboInputs, turboFile, turboProblems } from "../turbo.ts";

/**
 * pnpm discover            write the generated registration files and the desktop
 *                          shell's action route list (gitignored)
 * pnpm discover --fix      also rewrite the Studio's feature list in apps/studio/package.json,
 *                          add missing folder-discovery globs to turbo.json and write
 *                          each hashed catalog's committed src/catalog.generated.ts
 * pnpm discover --check    change nothing; fail if the feature list, a discovered
 *                          folder, a hashed catalog or turbo.json is out of date (CI)
 *
 * Turbo runs it before every typecheck, test and build.
 */
function main(argv: readonly string[]): number {
  const root = findRepoRoot();
  if (argv.includes("--check")) {
    return checkOnly(root);
  }
  const fix = argv.includes("--fix");
  if (fix && fixFeatureList(loadContext(root))) {
    console.log(
      "discover: updated the feature list in apps/studio/package.json. Run pnpm install.",
    );
  }
  const context = loadContext(root);
  const { discoveries, problems } = readFolderDiscoveries(context);
  for (const problem of problems) {
    console.log(formatProblem(problem));
  }
  if (fix) {
    fixCommittedFiles(context, discoveries);
  }
  if (writeFeaturesFile(context)) {
    console.log(`discover: wrote ${generatedFeaturesFile}.`);
  }
  for (const file of writeFolderFiles(context, discoveries)) {
    console.log(`discover: wrote ${file}.`);
  }
  if (writeActionRoutes(root)) {
    console.log(`discover: wrote ${actionRoutesFile}.`);
  }
  return 0;
}

/** `--check`: changes nothing, prints every problem and fails if there is one. */
function checkOnly(root: string): number {
  const context = loadContext(root);
  const { discoveries, problems: declared } = readFolderDiscoveries(context);
  const problems = [
    ...(rules["features"]?.(context).problems ?? []),
    ...(rules["catalog-hashes"]?.(context).problems ?? []),
    ...declared,
    ...folderProblems(context, discoveries),
    ...turboProblems(context, discoveries),
  ];
  for (const problem of problems) {
    console.log(formatProblem(problem));
  }
  console.log(`discover: generated files ${problems.length === 0 ? "up to date" : "out of date"}.`);
  return problems.length === 0 ? 0 : 1;
}

/** `--fix`: the committed files, which plain `pnpm discover` never writes. */
function fixCommittedFiles(context: CheckContext, discoveries: readonly FolderDiscovery[]): void {
  if (fixTurboInputs(context, discoveries)) {
    console.log(`discover: added folder-discovery globs to ${turboFile}.`);
  }
  for (const file of writeCatalogFiles(context)) {
    console.log(`discover: wrote ${file}. Commit it.`);
  }
}

process.exitCode = main(process.argv.slice(2));
