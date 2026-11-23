import { appVersionFiles, jsonVersion } from "../lib/app-version.ts";
import type { CheckContext } from "../lib/context.ts";
import { isSourceFile, isTestFile } from "../lib/source-files.ts";
import { owningPackage } from "../lib/workspace.ts";
import { type Checkouts, changeOf, type GuardFinding } from "./finding.ts";
import { readTestFileFacts } from "./test-file-facts.ts";

/**
 * Golden files and snapshots (plan 9.3, 9.6): files in a `golden/` or
 * `__snapshots__/` folder, and `.snap` files. A public API's spec files, the
 * `.schema.json` files under a `spec/` folder, count too (HAL-1664): changing
 * one changes what outsiders rely on.
 */
export function isGoldenFile(file: string): boolean {
  return (
    /(?:^|\/)(?:golden|__snapshots__)\//.test(file) || file.endsWith(".snap") || isSpecFile(file)
  );
}

/** A spec file: a JSON Schema anywhere under a `spec/` folder. */
function isSpecFile(file: string): boolean {
  return /(?:^|\/)spec\/(?:[^/]+\/)*[^/]+\.schema\.json$/.test(file);
}

const releasedSpecFile =
  /^(?<folder>(?:.+\/)?spec)\/released\/(?<version>[^/]+)\/(?<name>[^/]+\.schema\.json)$/;

/**
 * An added released spec that copies its package's current spec in the pull
 * request, under the version the pull request releases it as (HAL-16929). It
 * adds nothing a note could judge: the current spec is golden itself, and a
 * released copy never changes afterwards (`checkReleasedSpecs`). Any other
 * copy still needs a note (HAL-16940): it could never be deleted, so one under
 * another version would block that version's real release, and one under a
 * version the pull request doesn't change would claim an already shipped
 * version had an API it didn't. Only the Version packages pull request bumps
 * the version.
 */
function isFrozenCopy({ base, head }: Checkouts, file: string, change: string): boolean {
  const groups = releasedSpecFile.exec(file)?.groups;
  const folder = groups?.["folder"];
  const name = groups?.["name"];
  if (change !== "added" || folder === undefined || name === undefined) {
    return false;
  }
  const current = `${folder}/${name}`;
  const released = releaseVersion(file, head);
  return (
    groups?.["version"] === released &&
    released !== releaseVersion(file, base) &&
    head.files.includes(current) &&
    head.read(current) === head.read(file)
  );
}

/**
 * The version `pnpm version:sync` releases a spec under in a checkout: its
 * package's own version, or the app version for a package without one.
 */
function releaseVersion(file: string, context: CheckContext): string | undefined {
  const own = owningPackage(file, context.packages)?.manifest.version;
  if (own !== undefined) {
    return own;
  }
  const appManifest = appVersionFiles.packageJson;
  return context.files.includes(appManifest) ? jsonVersion(context.read(appManifest)) : undefined;
}

/**
 * Plan 9.3, point 3: a changed, added or deleted golden file or snapshot,
 * inline snapshots included, needs a note that lists the file. A released
 * spec the pull request adds as it releases the current one doesn't.
 */
export function checkGoldenFiles({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const golden = new Set([...base.files, ...head.files].filter(isGoldenFile));
  for (const file of [...golden].sort()) {
    const change = changeOf(file, base, head);
    if (change !== undefined && !isFrozenCopy({ base, head }, file, change)) {
      findings.push({ subject: file, file, message: `The golden file ${file} was ${change}.` });
    }
  }
  // The merge base's files too: a deleted test file removes its inline snapshots.
  const testFiles = new Set(
    [...base.files, ...head.files].filter((path) => isTestFile(path) && isSourceFile(path)),
  );
  for (const file of [...testFiles].sort()) {
    const before = inlineSnapshots(base, file);
    const after = inlineSnapshots(head, file);
    if (before.join("\0") !== after.join("\0")) {
      findings.push({
        subject: file,
        file,
        message: `${file} changes, adds or removes an inline snapshot (${after.length} now, ${before.length} on the merge base).`,
      });
    }
  }
  return findings;
}

function inlineSnapshots(context: CheckContext, file: string): readonly string[] {
  return context.files.includes(file)
    ? readTestFileFacts(file, context.read(file)).inlineSnapshots
    : [];
}
