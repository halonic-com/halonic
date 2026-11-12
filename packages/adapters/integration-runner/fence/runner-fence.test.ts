import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRunnerFile, type RunnerFile } from "../esbuild.config.ts";
import type { ConnectRunnerOptions } from "../src/halonic/connect-runner.ts";
import { type RunnerBlock, RunnerStoppedError } from "../src/halonic/limits.ts";
import { socketFolders } from "../src/halonic/runner-profile.ts";
import { type StartedRunner, startRunner } from "../src/halonic/start-runner.ts";
import { bridgeOptions, fakeRunnerProcess } from "../src/pipes.test-helper.ts";
import { fenceTestBase } from "./attack-session.ts";

// The built runner, started the way Halonic starts it when the fence is
// there: `startRunner` through a real `sandbox-srt` session with the untrusted
// profile, Node's permission model as the second layer. Only the kit is fake.

const forecastSource = `export const weather = {
  name: "weather",
  version: "1.0.0",
  tools: [],
  connect: (host) => ({
    callTool: async (name) => name + " in " + String(host.settings.baseUrl),
    close: async () => undefined,
  }),
};
`;

let folder: string;
let runner: RunnerFile;

beforeAll(async () => {
  folder = await fenceTestBase("rf-");
  await mkdir(join(folder, "home"));
  runner = await buildRunnerFile(join(folder, "dist", "runner.mjs"));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** A runner start in the fence, with what it wrote to stderr and what the fence refused. */
interface FenceStart {
  readonly started: Promise<StartedRunner>;
  /** The runner's stderr, and srt's own: srt and bubblewrap write their errors there too. */
  readonly log: readonly string[];
  readonly blocks: readonly RunnerBlock[];
}

/**
 * Starts the built runner for `source` in the fence. A start that fails says
 * how the runner stopped, what it and srt wrote to stderr and what the fence
 * refused (HAL-6577: a runner that exited before it was ready left no reason
 * in the log).
 */
async function startInFence(source: string): Promise<StartedRunner> {
  const start = startOnce(source);
  try {
    return await start.started;
  } catch (error) {
    throw explained(error, start);
  }
}

/** Starts the built runner for `source` in a fresh srt session, keeping its stderr and the fence's blocks. */
function startOnce(source: string): FenceStart {
  const { process: _process, nonce: _nonce, ...connect } = bridgeOptions(fakeRunnerProcess());
  return { started: startRunnerFor(source, connect), log: connect.log, blocks: connect.blocks };
}

/** The error with how the runner stopped, its stderr and the fence's blocks in its message. */
function explained(error: unknown, start: FenceStart): Error {
  return new Error(`the runner didn't start in the fence.\n${diagnosis(error, start)}`, {
    cause: error,
  });
}

/** What a failed start tells about itself. `log` is complete here: a failed start awaits the session's close. */
function diagnosis(error: unknown, start: FenceStart): string {
  const stop = error instanceof RunnerStoppedError ? JSON.stringify(error.stop) : String(error);
  const stderr = start.log.join("") || "(nothing)";
  const blocks = start.blocks.length === 0 ? "(none)" : JSON.stringify(start.blocks);
  return `stop: ${stop}\nstderr: ${stderr}\nfence blocks: ${blocks}`;
}

/** Writes the integration into fresh folders and starts the runner for it in a new srt session. */
async function startRunnerFor(
  source: string,
  connect: Omit<ConnectRunnerOptions, "process" | "nonce">,
): Promise<StartedRunner> {
  const name = Math.random().toString(36).slice(2);
  const integrationFolder = join(folder, `i-${name}`);
  const tempFolder = join(folder, `t-${name}`);
  await mkdir(integrationFolder);
  await mkdir(tempFolder);
  await writeFile(join(integrationFolder, "index.mjs"), source);
  return startRunner({
    ...connect,
    sandbox: new SrtSandbox(),
    files: {
      node: process.execPath,
      nodeFolder: dirname(dirname(process.execPath)),
      runnerFile: runner.path,
      integrationFolder,
    },
    entry: { file: join(integrationFolder, "index.mjs"), exportName: "weather" },
    machine: {
      // A home folder of its own: in CI the checkout, and with it srt's own
      // seccomp helper, is inside the real one, and hiding it stops srt.
      homeFolder: join(folder, "home"),
      socketFolders: socketFolders(process.env),
      tempFolder,
      timeLimitMs: 60_000,
    },
  });
}

describe("the built runner in a real srt session", () => {
  it("proves the fence, serves a tool and closes its session when it stops", async () => {
    const started = await startInFence(forecastSource);
    expect(started.fence).toEqual({ state: "fenced" });
    expect(await started.callTool("forecast", {})).toBe("forecast in https://api.example.com");
    await started.close();
    expect(await started.stopped).toMatchObject({ reason: "closed" });
  });
});
