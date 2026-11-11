import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRunnerFile, type RunnerFile } from "../esbuild.config.ts";
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

/** Starts the built runner for `source` in a fresh srt session. */
async function startInFence(source: string): Promise<StartedRunner> {
  const name = Math.random().toString(36).slice(2);
  const integrationFolder = join(folder, `i-${name}`);
  const tempFolder = join(folder, `t-${name}`);
  await mkdir(integrationFolder);
  await mkdir(tempFolder);
  await writeFile(join(integrationFolder, "index.mjs"), source);
  const { process: _process, nonce: _nonce, ...connect } = bridgeOptions(fakeRunnerProcess());
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
