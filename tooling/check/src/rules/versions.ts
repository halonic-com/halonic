import { appCrateManifest, appVersionFiles, jsonVersion } from "../lib/app-version.ts";
import { appVersionProblems } from "../lib/app-version-sync.ts";
import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isRefusedVersion, refusedVersion } from "../lib/release-version.ts";

/**
 * Fails when the Studio app's version differs between package.json,
 * tauri.conf.json, Cargo.toml and the workspace crates in Cargo.lock, so a
 * release can never carry two version numbers, or when it is 1.0.0.
 */
export function checkVersions(context: CheckContext): Report {
  const report = new Report("versions");
  const tracked = new Set(context.files);
  const read = (file: string): string | undefined =>
    tracked.has(file) ? context.read(file) : undefined;
  const manifests = context.files.filter((file) => appCrateManifest.test(file));
  for (const problem of appVersionProblems(read, manifests)) {
    report.error(problem.file, problem.message, problem.line);
  }
  const refused = refusedAppVersion(read);
  if (refused !== undefined) {
    report.error(appVersionFiles.packageJson, refused);
  }
  return report;
}

/**
 * Why the app version may not be released, or undefined. Checked here as
 * well as in the release workflow, so a changeset or a hand edit that sets
 * 1.0.0 fails the Version packages pull request long before a release.
 */
function refusedAppVersion(read: (file: string) => string | undefined): string | undefined {
  const text = read(appVersionFiles.packageJson);
  const version = text === undefined ? undefined : jsonVersion(text);
  if (version === undefined || !isRefusedVersion(version)) {
    return undefined;
  }
  return `is version ${version}, and Halonic never ships as ${refusedVersion}: on npm it is the old placeholder. Use 1.0.1 or 1.1.0 (HAL-19109).`;
}
