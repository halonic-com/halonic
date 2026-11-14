import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SandboxProcess, SandboxProfile } from "@halonicjs/ports";
import { BoxFolders } from "../src/box-folders.ts";
import { mxcSdkLoader, systemMachine } from "../src/machine.ts";
import { MxcSandbox } from "../src/mxc-sandbox.ts";
import { mxcSdkSetup } from "../src/sdk-setup.ts";

/** The real adapter, with box folders under a data folder of its own for this run. */
export interface RealMxc {
  sandbox: MxcSandbox;
  /** Where this run's box folders are made. */
  dataFolder: string;
  /** A folder for this run's files, outside the data folder. */
  base: string;
  remove(): Promise<void>;
}

/**
 * The real MXC on this computer. The folders are made under the user's own
 * profile, as Halonic's data folder is: `%TEMP%` is never used for a box.
 * The SDK is downloaded and verified the way the host does it, into the
 * data folder, so the run needs no SDK in the lockfile.
 */
export async function realMxc(): Promise<RealMxc> {
  const local = process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local");
  const root = join(local, "halonic-fence-tests");
  await mkdir(root, { recursive: true });
  const folder = await mkdtemp(join(root, "run-"));
  const dataFolder = join(folder, "data");
  const base = join(folder, "files");
  await mkdir(dataFolder);
  await mkdir(base);
  const sdk = mxcSdkSetup({ root: join(dataFolder, "mxc-sdk") });
  const download = await sdk.download();
  if (!download.done) throw new Error(`MXC's SDK didn't download: ${download.problem}`);
  return {
    sandbox: new MxcSandbox(systemMachine(mxcSdkLoader(process.platform, sdk.importSdk)), new BoxFolders(dataFolder, process.pid)),
    dataFolder,
    base,
    // The SDK's native module stays loaded in this process, and Windows won't
    // delete a loaded DLL, so the leftover is the runner's to clean, not a failure.
    remove: () => rm(folder, { recursive: true, force: true }).catch(() => undefined),
  };
}

/** The folders of one test's profile, made under `base`. */
export interface TestFolders {
  work: string;
  temp: string;
  readOnly: string;
  secrets: string;
  secret: string;
  outside: string;
}

/** Makes the folders and the secret file of a test profile. */
export async function makeFolders(base: string): Promise<TestFolders> {
  const folders: TestFolders = {
    work: join(base, "work"),
    temp: join(base, "temp"),
    readOnly: join(base, "readonly"),
    secrets: join(base, "secrets"),
    secret: join(base, "secrets", "key.txt"),
    outside: join(base, "outside"),
  };
  for (const folder of [
    folders.work,
    folders.temp,
    folders.readOnly,
    folders.secrets,
    folders.outside,
  ]) {
    await mkdir(folder, { recursive: true });
  }
  await writeFile(folders.secret, "hunter2");
  await writeFile(join(folders.readOnly, "hello.txt"), "hello");
  // Host-side control: the folder outside the grants can be written by this
  // process, so a refused write by a boxed program is the fence's doing.
  await writeFile(join(folders.outside, "control.txt"), "control");
  return folders;
}

/**
 * A junction made on the host, as a cloned repository can hold one. Junctions
 * need no special rights on Windows, so a failure here is a real failure.
 */
export async function makeJunction(target: string, link: string): Promise<void> {
  await symlink(target, link, "junction");
}

/** A profile over `folders`. Node's own folder is read-only so a boxed program can run Node. */
export function profileOver(
  folders: TestFolders,
  overrides: Partial<SandboxProfile> = {},
): SandboxProfile {
  return {
    workingFolder: folders.work,
    tempFolder: folders.temp,
    settingsFolder: null,
    readOnlyPaths: [folders.readOnly, dirname(process.execPath)],
    deniedPaths: [folders.secret],
    env: {},
    network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
    ...overrides,
  };
}

/** What a program printed and how it ended. */
export async function finish(process: SandboxProcess) {
  const [out, err, exit] = await Promise.all([
    read(process.stdout),
    read(process.stderr),
    process.exited,
  ]);
  return { out, err, exit };
}

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}
