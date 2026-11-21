import type { CheckContext } from "../lib/context.ts";
import type { Report } from "../lib/problems.ts";
import { checkAbsolutePaths } from "./absolute-paths.ts";
import { checkAdvisories } from "./advisories.ts";
import { checkAgentsMd } from "./agents-md.ts";
import { checkApiSpecs } from "./api-specs.ts";
import { checkChangesets } from "./changesets.ts";
import { checkDco } from "./dco.ts";
import { checkDeny } from "./deny.ts";
import { checkDependencies } from "./dependencies.ts";
import { checkFeatures } from "./features.ts";
import { checkFileSize } from "./file-size.ts";
import { checkInvisibleCharacters } from "./invisible-characters.ts";
import { checkLayers } from "./layers.ts";
import { checkLockfile } from "./lockfile.ts";
import { checkMarkdownTables } from "./markdown-tables.ts";
import { checkMigrationsAdditive } from "./migrations-additive.ts";
import { checkNames } from "./names.ts";
import { checkNativeDisabled } from "./native-disabled.ts";
import { checkNotesSigned } from "./notes-signed.ts";
import { checkPackages } from "./packages.ts";
import { checkProcessStarts } from "./process-starts.ts";
import { checkReadmeExamples } from "./readme-examples.ts";
import { checkTrace } from "./trace.ts";
import { checkTrackerLinks } from "./tracker-links.ts";
import { checkVersions } from "./versions.ts";
import { checkWebviewApis } from "./webview-apis.ts";

/** Every rule `pnpm check` runs, by name. */
export const rules: Readonly<Record<string, (context: CheckContext) => Report>> = {
  packages: checkPackages,
  "agents-md": checkAgentsMd,
  layers: checkLayers,
  dependencies: checkDependencies,
  advisories: (context) => checkAdvisories(context),
  "deny-toml": (context) => checkDeny(context),
  "migrations-additive": checkMigrationsAdditive,
  names: checkNames,
  features: checkFeatures,
  "file-size": checkFileSize,
  lockfile: checkLockfile,
  "absolute-paths": checkAbsolutePaths,
  "process-starts": checkProcessStarts,
  "webview-apis": checkWebviewApis,
  "invisible-characters": checkInvisibleCharacters,
  "markdown-tables": checkMarkdownTables,
  "tracker-links": checkTrackerLinks,
  // On a pull request, GitHub sets GITHUB_HEAD_REF to its branch; the note
  // check is the gate for that branch's own note.
  "notes-signed": (context) => checkNotesSigned(context, process.env["GITHUB_HEAD_REF"]),
  "native-disabled": checkNativeDisabled,
  "readme-examples": checkReadmeExamples,
  versions: checkVersions,
  changesets: checkChangesets,
  "api-specs": checkApiSpecs,
  dco: (context) => checkDco(context),
  trace: checkTrace,
};

/**
 * Rules that read the tests' result files. Plain `pnpm check` runs before
 * the tests, so it leaves these out; they run only when named, after the
 * tests, as in `pnpm check trace`.
 */
export const rulesAfterTests: readonly string[] = ["trace"];

/**
 * The rules one `pnpm check` run covers: the named ones, or with no names
 * every rule except those in `rulesAfterTests`.
 */
export function selectRules(names: readonly string[]): string[] {
  const all = Object.keys(rules);
  if (names.length > 0) {
    return all.filter((name) => names.includes(name));
  }
  return all.filter((name) => !rulesAfterTests.includes(name));
}
