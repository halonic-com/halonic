import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import type { SandboxFence } from "@halonicjs/ports";
import type { Runner } from "./srt-runner.ts";

/** How long the probe may take before the fence counts as unproven. */
const probeTimeoutMs = 15_000;

/**
 * What the probe does inside the fence: reads the control file (which the
 * fence lets through, to prove the probe can see the session's folders at
 * all), reads the canary file (which the fence hides) and connects to the
 * canary port on loopback (which the fence blocks). It reports each result.
 */
const probeScript = `
const fs = require("node:fs");
const net = require("node:net");
const [control, canary, port] = process.argv.slice(2);
const result = {};
try { fs.readFileSync(control); result.control = "readable"; } catch { result.control = "hidden"; }
try { fs.readFileSync(canary); result.canary = "readable"; } catch { result.canary = "hidden"; }
const finish = (state) => {
  result.port = state;
  console.log(JSON.stringify(result));
  process.exit(0);
};
const socket = net.connect({ host: "127.0.0.1", port: Number(port) });
socket.on("connect", () => finish("connected"));
socket.on("error", () => finish("blocked"));
setTimeout(() => finish("blocked"), 3000);
`;

/** The name the probe file starts with in the session's temp folder. */
export const probeFilePrefix = ".halonic-fence-probe-";

/** What a session needs to prove its fence. */
export interface FenceProofInput {
  runner: Runner;
  settingsPath: string;
  /** A folder the fence hides from the program; the canary file goes in it. */
  canaryFolder: string;
  /** The session's temp folder, which the program can read and write. */
  tempFolder: string;
  workingFolder: string;
  launcherEnv: Record<string, string>;
  programEnv: Record<string, string>;
  /** Whether the probe, like the session's programs, gets none of what srt sets inside the fence. */
  withoutSrtEnv: boolean;
}

/** Collects what comes out of a stream, as text. */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

/** A server on a loopback port that the fence must block, and whether anything reached it. */
async function listenOnCanaryPort(): Promise<{
  server: Server;
  port: number;
  reached: () => boolean;
}> {
  let reached = false;
  const server = createServer((socket) => {
    reached = true;
    socket.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no canary port");
  return { server, port: address.port, reached: () => reached };
}

/**
 * Runs the fence's own probes: a canary file that the fence hides and a
 * loopback port that it blocks. `fenced` only when the probe ran inside the
 * fence, saw the folders it should, and was refused both. Anything else,
 * including a probe that could not run, is `not-fenced` with the sentence
 * that says which.
 */
export async function proveFence(input: FenceProofInput): Promise<SandboxFence> {
  const controlFile = join(
    input.tempFolder,
    `.halonic-fence-control-${randomBytes(4).toString("hex")}`,
  );
  const probeFile = join(
    input.tempFolder,
    `${probeFilePrefix}${randomBytes(4).toString("hex")}.cjs`,
  );
  const canaryFile = join(input.canaryFolder, "canary.txt");
  const canaryPort = await listenOnCanaryPort();
  try {
    await mkdir(input.canaryFolder, { recursive: true });
    await writeFile(canaryFile, randomBytes(16).toString("hex"));
    await writeFile(controlFile, "control");
    // A file, not `node -e`: the script has quotes and line breaks, which cmd.exe can't be given on Windows.
    await writeFile(probeFile, probeScript);
    return await runProbe(input, probeFile, controlFile, canaryFile, canaryPort);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { state: "not-fenced", reason: `the fence probe could not run: ${why}` };
  } finally {
    canaryPort.server.close();
    await rm(controlFile, { force: true });
    await rm(probeFile, { force: true });
  }
}

async function runProbe(
  input: FenceProofInput,
  probeFile: string,
  controlFile: string,
  canaryFile: string,
  canaryPort: { port: number; reached: () => boolean },
): Promise<SandboxFence> {
  const probe = await input.runner.run({
    settingsPath: input.settingsPath,
    program: process.execPath,
    args: [probeFile, controlFile, canaryFile, String(canaryPort.port)],
    cwd: input.workingFolder,
    launcherEnv: input.launcherEnv,
    programEnv: input.programEnv,
    withoutSrtEnv: input.withoutSrtEnv,
  });
  const timer = setTimeout(() => probe.killTree(), probeTimeoutMs);
  try {
    void probe.stdin.close().catch(() => {});
    const [output, errors, exit] = await Promise.all([
      readAll(probe.stdout),
      readAll(probe.stderr),
      probe.ended,
    ]);
    if (canaryPort.reached()) {
      return {
        state: "not-fenced",
        reason: "a program inside the fence reached a loopback port it should not reach",
      };
    }
    let result: { control?: string; canary?: string; port?: string };
    try {
      result = JSON.parse(output.trim().split("\n").pop() ?? "");
    } catch {
      const detail = errors.trim().split("\n")[0] ?? "";
      return {
        state: "not-fenced",
        reason: `the fence probe did not report (exit ${exit.code ?? exit.signal})${detail === "" ? "" : `: ${detail}`}`,
      };
    }
    if (result.control !== "readable") {
      return {
        state: "not-fenced",
        reason:
          "the fence probe could not see the session's temp folder, so its result proves nothing",
      };
    }
    if (result.canary !== "hidden") {
      return {
        state: "not-fenced",
        reason: "a program inside the fence could read a file the fence should hide",
      };
    }
    if (result.port !== "blocked") {
      return {
        state: "not-fenced",
        reason: "a program inside the fence could connect to a loopback port it should not reach",
      };
    }
    return { state: "fenced" };
  } finally {
    clearTimeout(timer);
    probe.killTree();
  }
}
