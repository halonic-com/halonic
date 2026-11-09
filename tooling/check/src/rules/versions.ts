import { appCrateManifest } from "../lib/app-version.ts";
import { appVersionProblems } from "../lib/app-version-sync.ts";
import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/**
 * Fails when the Studio app's version differs between package.json,
 * tauri.conf.json, Cargo.toml and the workspace crates in Cargo.lock, so a
 * release can never carry two version numbers.
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
  return report;
}
