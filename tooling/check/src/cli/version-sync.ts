import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { appVersion, type ReadFile, syncAppVersion } from "../lib/app-version-sync.ts";
import { snapshotChangedSpecs } from "../lib/spec-snapshot.ts";
import {
  findRepoRoot,
  listRepoFiles,
  listWorkspacePackages,
  owningPackage,
} from "../lib/workspace.ts";

/**
 * pnpm version:sync
 *
 * Copies the Studio app's version from apps/studio/package.json into
 * tauri.conf.json, Cargo.toml and Cargo.lock, and keeps a frozen copy of
 * every spec file the release changes in its package's
 * `spec/released/<version>/`. Changesets' "Version packages" pull request
 * runs it right after `changeset version`.
 */
function main(): number {
  const root = findRepoRoot();
  const read: ReadFile = (file) => {
    const path = join(root, file);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  };
  let changed: Map<string, string>;
  try {
    changed = new Map([...syncAppVersion(read), ...snapshotSpecs(root, read)]);
  } catch (error) {
    console.error(`version:sync: ${(error as Error).message}`);
    return 1;
  }
  for (const [file, text] of changed) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
    console.log(`version:sync: updated ${file}`);
  }
  if (changed.size === 0) {
    console.log("version:sync: every file already has the app version, and no spec changed.");
  }
  return 0;
}

/**
 * The frozen spec copies this release needs. A spec is released under its
 * package's own version, or under the app version for a package without
 * one (such as the private `@halonicjs/format`, which ships in the app).
 */
function snapshotSpecs(root: string, read: ReadFile): Map<string, string> {
  const packages = listWorkspacePackages(root);
  const releaseVersion = (specFile: string): string =>
    owningPackage(specFile, packages)?.manifest.version ?? appVersion(read);
  return snapshotChangedSpecs(listRepoFiles(root), read, releaseVersion);
}

process.exitCode = main();
