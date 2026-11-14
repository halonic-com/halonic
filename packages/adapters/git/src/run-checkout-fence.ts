import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isAbsolutePath } from "@halonicjs/adapter-system-node";

// What a run's folder gives the sandbox profile: where the program's temp
// files and build cache go, and which parts of the checkout it may only read.

/** The profile fields that come from a run's folder. */
export interface RunCheckoutFence {
  /** A private temp folder inside the run's folder, for `SandboxProfile.tempFolder`. */
  tempFolder: string;
  /** The checkout's hooks and config, which the program may read but not change. */
  readOnlyPaths: string[];
  /** `TMPDIR` and the Turborepo cache folder, to merge into `SandboxProfile.env`. */
  env: { TMPDIR: string; TURBO_CACHE_DIR: string };
}

/** Where the run's own scratch lives, so one line in `.git/info/exclude` hides all of it from git. */
const scratchName = ".halonic-run";

/**
 * Makes the temp and cache folders in a run's folder and says what the
 * sandbox profile needs to use them. The cache starts empty: the run's first
 * verify is a cold one.
 *
 * Both folders are excluded from git through `.git/info/exclude`, which is
 * not one of the read-only paths, so the scratch never shows up as changes.
 *
 * @throws Error when `folder` isn't absolute
 */
export async function makeRunCheckoutFence(folder: string): Promise<RunCheckoutFence> {
  if (!isAbsolutePath(folder)) throw new Error(`A run folder is absolute, not ${folder}.`);
  const tempFolder = join(folder, scratchName, "tmp");
  const cacheFolder = join(folder, scratchName, "turbo");
  await mkdir(tempFolder, { recursive: true });
  await mkdir(cacheFolder, { recursive: true });
  // `--template=` leaves no `info` folder in the checkout.
  await mkdir(join(folder, ".git", "info"), { recursive: true });
  await appendFile(join(folder, ".git", "info", "exclude"), `/${scratchName}/\n`);
  return {
    tempFolder,
    readOnlyPaths: [join(folder, ".git", "hooks"), join(folder, ".git", "config")],
    env: { TMPDIR: tempFolder, TURBO_CACHE_DIR: cacheFolder },
  };
}
