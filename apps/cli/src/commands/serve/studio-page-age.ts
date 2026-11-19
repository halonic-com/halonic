// Whether the built Studio page is older than its sources (HAL-13710). `serve`
// reads the page where the Studio's build leaves it, and updating a clone
// (`git pull`, `pnpm install`) doesn't build it again, so a newer server
// could serve an older page without a word. The check compares times only:
// it reads no file's content and builds nothing.

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

/** The Studio app's own files, besides `src`, that go into its page. */
const appPageFiles = ["studio.html", "vite.config.ts"];

/**
 * Whether a source of the Studio page changed after the page was built: a
 * file in `src`, or the `package.json`, of the Studio app or of a workspace
 * package it uses, newer than the page's `studio.html`. Tests don't count,
 * as they don't go into the page.
 *
 * @param studioFolder - the built page, such as `apps/studio/dist/studio`
 * @param appFolder - the Studio app it is built from, such as `apps/studio`
 * @returns false also when the page isn't built or a folder can't be read:
 *   this is a hint, never a reason not to serve
 */
export async function studioPageIsOutdated(
  studioFolder: string,
  appFolder: string,
): Promise<boolean> {
  try {
    const builtAt = (await stat(join(studioFolder, "studio.html"))).mtimeMs;
    for (const file of appPageFiles) {
      if (await changedAfter(join(appFolder, file), builtAt)) return true;
    }
    for (const folder of await packagesOf(appFolder)) {
      if (await changedAfter(join(folder, "package.json"), builtAt)) return true;
      if (await anyNewer(join(folder, "src"), builtAt)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * The app and every workspace package it uses, directly or through another,
 * each as its real folder. pnpm links a `workspace:` dependency into the
 * package's `node_modules`, so the link leads to its folder.
 */
async function packagesOf(appFolder: string): Promise<readonly string[]> {
  const found = new Set<string>([await realpath(appFolder)]);
  const waiting = [...found];
  for (let folder = waiting.pop(); folder !== undefined; folder = waiting.pop()) {
    const manifest = JSON.parse(await readFile(join(folder, "package.json"), "utf8")) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (!version.startsWith("workspace:")) continue;
      const linked = await realpath(join(folder, "node_modules", name)).catch(() => null);
      if (linked === null || found.has(linked)) continue;
      found.add(linked);
      waiting.push(linked);
    }
  }
  return [...found];
}

/** Whether a file under `folder`, tests left out, changed after `builtAt`; false for a missing folder. */
async function anyNewer(folder: string, builtAt: number): Promise<boolean> {
  const entries = await readdir(folder, { withFileTypes: true, recursive: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || /\.test\.[a-z]+$/u.test(entry.name)) continue;
    if (await changedAfter(join(entry.parentPath, entry.name), builtAt)) return true;
  }
  return false;
}

/** Whether `file` changed after `builtAt`; false when it is missing. */
async function changedAfter(file: string, builtAt: number): Promise<boolean> {
  const changedAt = (await stat(file).catch(() => null))?.mtimeMs;
  return changedAt !== undefined && changedAt > builtAt;
}
