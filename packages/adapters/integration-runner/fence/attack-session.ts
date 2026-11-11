// Runs one attack script in the runner's own untrusted profile, in a real
// `sandbox-srt` session (design HAL-958, section 6). The script is started the
// way the runner is: the same profile, the same Node, and with Node's layer on
// the same permission flags. With Node's layer off it is plain Node, so only
// the OS fence stands between the script and the machine. That is what an
// integration has once it gets past the module hook and Node's layer.
//
// An attack script prints one JSON object: for each attempt its name and
// whether it was `refused` or `allowed`, with the error code or what it got.
// So a test can tell an attempt that ran and was refused from one that never
// ran (HAL-180 finding 13).

import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Sandbox, SandboxCommand } from "@halonicjs/ports";
import {
  diskOnThisMachine,
  type RunnerFiles,
  type RunnerMachine,
  realRunnerPaths,
  runnerProfile,
} from "../src/halonic/runner-profile.ts";

/** Whether Node's permission model runs as the second layer, as in production. */
export type NodeLayer = "on" | "off";

/** What happened to one attempt. */
export interface Attempt {
  readonly outcome: "refused" | "allowed";
  /** The error code when refused, or what the attempt got when allowed. */
  readonly detail: string;
}

/** The result of an attack script: its attempts by name, its stderr and how it ended. */
export interface AttackResult {
  readonly attempts: Readonly<Record<string, Attempt>>;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/**
 * The helper every attack script starts with. `attempt` runs one try and
 * records `allowed` with what it got, or `refused` with the error's code.
 * The script prints the record when it ends.
 */
const attemptHelper = `
const attempts = {};
async function attempt(name, run) {
  try {
    const got = await run();
    attempts[name] = { outcome: "allowed", detail: String(got).slice(0, 200) };
  } catch (error) {
    attempts[name] = { outcome: "refused", detail: String(error?.code ?? error?.cause?.code ?? error?.message ?? error) };
  }
}
process.on("beforeExit", () => {
  process.stdout.write(JSON.stringify(attempts) + "\\n");
});
`;

/**
 * A fresh base folder for fence tests, at its real place. srt puts its socket
 * in the session's temp folder, and a socket path may be only 104 bytes on
 * macOS, where `tmpdir()` is already a long path under `/var/folders`. So the
 * base goes in `/tmp`, with a short name.
 */
export async function fenceTestBase(prefix: string): Promise<string> {
  return realpath(await mkdtemp(join("/tmp", prefix)));
}

/** The folders one attack run uses. */
export interface AttackFolders {
  /** The integration's folder; the attack script is written into it. */
  readonly integrationFolder: string;
  /** The run's private temp folder, the one folder it may write to. */
  readonly tempFolder: string;
}

/** Creates a fresh integration folder and temp folder under `base`. */
export async function attackFolders(base: string, name: string): Promise<AttackFolders> {
  // Short names, for the socket path (see `fenceTestBase`).
  const integrationFolder = join(base, `i-${name}`);
  const tempFolder = join(base, `t-${name}`);
  await mkdir(integrationFolder, { recursive: true });
  await mkdir(tempFolder, { recursive: true });
  return { integrationFolder, tempFolder };
}

/** What {@link runAttack} needs. */
export interface RunAttackOptions {
  readonly sandbox: Sandbox;
  readonly folders: AttackFolders;
  /** The body of the attack script, after the helper: calls to `attempt(name, run)`. */
  readonly script: string;
  readonly nodeLayer: NodeLayer;
  /** The home folder and the socket folders the profile hides. */
  readonly hidden: Pick<RunnerMachine, "homeFolder" | "socketFolders">;
}

/**
 * Writes the attack script into the integration's folder, opens a session
 * with the runner's profile for it, runs the script and reads its record.
 *
 * @throws when the script prints no record, such as when it never started
 */
export async function runAttack(options: RunAttackOptions): Promise<AttackResult> {
  const scriptFile = join(options.folders.integrationFolder, "attack.mjs");
  await writeFile(scriptFile, `${attemptHelper}\n${options.script}\n`);
  const { files, machine } = realRunnerPaths(
    {
      node: process.execPath,
      nodeFolder: dirname(dirname(process.execPath)),
      runnerFile: scriptFile,
      integrationFolder: options.folders.integrationFolder,
    },
    { ...options.hidden, tempFolder: options.folders.tempFolder, timeLimitMs: 30_000 },
  );
  const session = await options.sandbox.open(runnerProfile(files, machine, diskOnThisMachine));
  try {
    const started = await session.start(attackCommand(files, options.nodeLayer));
    await started.stdin.close();
    const [stdout, stderr, exit] = await Promise.all([
      readText(started.stdout),
      readText(started.stderr),
      started.exited,
    ]);
    const record = stdout.trim().split("\n").at(-1) ?? "";
    let attempts: Record<string, Attempt>;
    try {
      attempts = JSON.parse(record) as Record<string, Attempt>;
    } catch {
      throw new Error(`the attack script printed no record (exit ${exit.code}): ${stderr}`);
    }
    return { attempts, stderr, exitCode: exit.code };
  } finally {
    await session.close();
  }
}

/**
 * Node started on the attack script. With Node's layer on, it gets the
 * runner's own flags: read only the script and the integration's folder,
 * nothing else allowed (see `runnerCommand`).
 */
function attackCommand(files: RunnerFiles, nodeLayer: NodeLayer): SandboxCommand {
  const nodeFlags =
    nodeLayer === "on" ? ["--permission", `--allow-fs-read=${files.integrationFolder}`] : [];
  return { program: files.node, args: [...nodeFlags, files.runnerFile] };
}

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}
