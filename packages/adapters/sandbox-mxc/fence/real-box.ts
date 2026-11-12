import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SandboxProcess, SandboxProfile } from "@halonicjs/ports";
import { BoxFolders } from "../src/box-folders.ts";
import { systemMachine } from "../src/machine.ts";
import { MxcSandbox } from "../src/mxc-sandbox.ts";

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
 */
export async function realMxc(): Promise<RealMxc> {
  const root = join(homedir(), "AppData", "Local", "halonic-fence-tests");
  await mkdir(root, { recursive: true });
  const folder = await mkdtemp(join(root, "run-"));
  const dataFolder = join(folder, "data");
  const base = join(folder, "files");
  await mkdir(dataFolder);
  await mkdir(base);
  return {
    sandbox: new MxcSandbox(systemMachine(), new BoxFolders(dataFolder, process.pid)),
    dataFolder,
    base,
    remove: () => rm(folder, { recursive: true, force: true }),
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
  for (const folder of [folders.work, folders.temp, folders.readOnly, folders.secrets]) {
    await mkdir(folder, { recursive: true });
  }
  await writeFile(folders.secret, "hunter2");
  await writeFile(join(folders.readOnly, "hello.txt"), "hello");
  return folders;
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
