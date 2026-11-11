import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRunnerFile, type RunnerFile } from "../esbuild.config.ts";
import { socketFolders } from "./halonic/runner-profile.ts";
import { type StartedRunner, startRunner } from "./halonic/start-runner.ts";
import { bridgeOptions, fakeRunnerProcess } from "./pipes.test-helper.ts";

// The built runner, started the way Halonic starts it on the path the user
// confirmed without the fence: through the launcher's sandbox, with Node's
// permission model as the only layer. Real processes, no fakes but the kit.

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

// Asks Node for its file system binding, which the module hook can't see and
// only Node's permission model refuses.
const nosySource = `export const weather = {
  name: "weather",
  version: "1.0.0",
  tools: [],
  connect: () => ({
    callTool: async () => typeof process.binding("fs"),
    close: async () => undefined,
  }),
};
`;

let folder: string;
let runner: RunnerFile;

beforeAll(async () => {
  // Real paths, as the runner gets in production: tmpdir() is a symlink on macOS.
  folder = await realpath(await mkdtemp(join(tmpdir(), "host-runner-")));
  runner = await buildRunnerFile(join(folder, "dist", "runner.mjs"));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Starts the built runner for `source` through the launcher's sandbox. */
async function startThroughLauncher(source: string): Promise<StartedRunner> {
  const name = Math.random().toString(36).slice(2);
  const integrationFolder = join(folder, `integration-${name}`);
  const tempFolder = join(folder, `temp-${name}`);
  await mkdir(integrationFolder);
  await mkdir(tempFolder);
  await writeFile(join(integrationFolder, "index.mjs"), source);
  const { process: _process, nonce: _nonce, ...connect } = bridgeOptions(fakeRunnerProcess());
  return startRunner({
    ...connect,
    sandbox: createHostSandbox(),
    files: {
      node: process.execPath,
      nodeFolder: dirname(dirname(process.execPath)),
      runnerFile: runner.path,
      integrationFolder,
    },
    entry: { file: join(integrationFolder, "index.mjs"), exportName: "weather" },
    machine: {
      homeFolder: homedir(),
      socketFolders: socketFolders(process.env),
      tempFolder,
      timeLimitMs: 60_000,
    },
  });
}

verifies("integration-runner.start-without-fence", () => {
  describe("the built runner through the launcher's sandbox", () => {
    it("serves a tool and reports its fence proof as off, never fenced", async () => {
      const started = await startThroughLauncher(forecastSource);
      expect(started.fence).toEqual({ state: "off" });
      expect(await started.callTool("forecast", {})).toBe("forecast in https://api.example.com");
      await started.close();
      expect(await started.stopped).toMatchObject({ reason: "closed" });
    });

    it("keeps Node's permission model on, so the integration gets no file system binding", async () => {
      const started = await startThroughLauncher(nosySource);
      await expect(started.callTool("forecast", {})).rejects.toThrow(/process\.binding/);
      await started.close();
    });
  });
});
