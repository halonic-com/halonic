// The real MXC for the runner's attack list: the adapter on this computer's
// MXC, with its box folders and its downloaded SDK under a data folder of this
// run's own. The SDK is downloaded and verified the way the host does it, so
// the run needs no SDK in the lockfile. The runner's profile has no network
// and no bridge, so nothing has to listen for the box.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  BoxFolders,
  MxcSandbox,
  mxcSdkLoader,
  mxcSdkSetup,
  systemMachine,
} from "@halonicjs/adapter-sandbox-mxc";

/** The real adapter and the folder its run lives in. */
export interface RealMxc {
  readonly sandbox: MxcSandbox;
  /** A folder for this run's files, outside the data folder. */
  readonly base: string;
  remove(): Promise<void>;
}

/**
 * Makes the folders under the user's own profile, as Halonic's data folder is:
 * `%TEMP%` is never used for a box.
 *
 * @throws when MXC's SDK doesn't download
 */
export async function realMxc(): Promise<RealMxc> {
  const local = process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local");
  const root = join(local, "halonic-fence-tests");
  await mkdir(root, { recursive: true });
  const folder = await mkdtemp(join(root, "ra-"));
  const dataFolder = join(folder, "data");
  const base = join(folder, "files");
  await mkdir(dataFolder);
  await mkdir(base);
  const sdk = mxcSdkSetup({ root: join(dataFolder, "mxc-sdk") });
  const download = await sdk.download();
  if (!download.done) throw new Error(`MXC's SDK didn't download: ${download.problem}`);
  return {
    sandbox: new MxcSandbox(
      systemMachine(mxcSdkLoader(process.platform, sdk.importSdk)),
      new BoxFolders(dataFolder, process.pid),
    ),
    base,
    // The SDK's native module stays loaded in this process, and Windows won't
    // delete a loaded DLL, so the leftover is the runner's to clean, not a failure.
    remove: () => rm(folder, { recursive: true, force: true }).catch(() => undefined),
  };
}
