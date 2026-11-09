import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { syncAppVersion } from "../lib/app-version-sync.ts";
import { findRepoRoot } from "../lib/workspace.ts";

/**
 * pnpm version:sync
 *
 * Copies the Studio app's version from apps/studio/package.json into
 * tauri.conf.json, Cargo.toml and Cargo.lock. Changesets' "Version
 * packages" pull request runs it right after `changeset version`.
 */
function main(): number {
  const root = findRepoRoot();
  const read = (file: string): string | undefined => {
    const path = join(root, file);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  };
  let changed: Map<string, string>;
  try {
    changed = syncAppVersion(read);
  } catch (error) {
    console.error(`version:sync: ${(error as Error).message}`);
    return 1;
  }
  for (const [file, text] of changed) {
    writeFileSync(join(root, file), text);
    console.log(`version:sync: updated ${file}`);
  }
  if (changed.size === 0) {
    console.log("version:sync: every file already has the app version.");
  }
  return 0;
}

process.exitCode = main();
