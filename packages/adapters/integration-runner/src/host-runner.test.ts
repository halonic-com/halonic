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
  // Each test starts a real Node with its permission model and loads the built runner. The first
  // start in a file takes about 2.5 s on a cold machine and 0.2 s after, but one took 7.7 s while
  // other packages ran their tests too (HAL-5317). The build is already shared above, and each test
  // needs its own integration, so there is no more setup to share. A real hang still fails at 20 s,
  // well before the runner's own 60 s time limit.
  describe("the built runner through the launcher's sandbox", { timeout: 20_000 }, () => {
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
