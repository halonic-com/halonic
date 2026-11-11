import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import type { SandboxExit, SandboxProcess } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRunnerFile, type RunnerFile } from "../esbuild.config.ts";
import { connectRunner } from "./halonic/connect-runner.ts";
import { runnerCommand } from "./halonic/runner-command.ts";
import { bridgeOptions, fakeRunnerProcess, testNonce } from "./pipes.test-helper.ts";

// A small integration, as a user's folder would hold it: plain JavaScript,
// no imports, so Node needs to read nothing but this folder and the runner.
const integrationSource = `export const weather = {
  name: "weather",
  version: "1.0.0",
  tools: [],
  connect: (host) => ({
    callTool: async (name) => name + " in " + String(host.settings.baseUrl),
    close: async () => undefined,
  }),
};
`;

// Reads a file outside what Node may read, to show the permission layer holds.
const nosySource = `import { readFileSync } from "node:fs";
export const weather = {
  name: "weather",
  version: "1.0.0",
  tools: [],
  connect: () => ({
    callTool: async () => readFileSync(process.argv[1] + ".outside", "utf8"),
    close: async () => undefined,
  }),
};
`;

let folder: string;
let runner: RunnerFile;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "runner-file-"));
  runner = await buildRunnerFile(join(folder, "dist", "runner.mjs"));
  await writeFile(`${runner.path}.outside`, "not for the integration");
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Starts the built runner as Node would inside the fence, without the fence itself. */
async function startBuiltRunner(source: string): Promise<SandboxProcess> {
  const integrationFolder = join(folder, `integration-${Math.random().toString(36).slice(2)}`);
  await mkdir(integrationFolder);
  const entryFile = join(integrationFolder, "index.mjs");
  await writeFile(entryFile, source);
  const command = runnerCommand(
    { node: process.execPath, nodeFolder: "", runnerFile: runner.path, integrationFolder },
    { nonce: testNonce, entryFile, exportName: "weather" },
  );
  const child = spawn(command.program, command.args, { stdio: ["pipe", "pipe", "pipe"], env: {} });
  const exited = new Promise<SandboxExit>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal, reason: "exited" }));
  });
  return {
    stdin: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    stderr: Readable.toWeb(child.stderr) as ReadableStream<Uint8Array>,
    exited,
    kill: async () => {
      child.kill("SIGKILL");
      await exited;
    },
  };
}

verifies("integration-runner.runner-file", () => {
  describe("buildRunnerFile", () => {
    it("writes one file that imports only Node's own modules", () => {
      expect(runner.imports.length).toBeGreaterThan(0);
      for (const name of runner.imports) {
        expect(name).toMatch(/^node:/);
      }
    });

    it("runs under Node's permission model reading only itself and the integration's folder", async () => {
      const options = bridgeOptions(fakeRunnerProcess(), {
        process: await startBuiltRunner(integrationSource),
      });
      const connection = await connectRunner(options);
      expect(await connection.callTool("forecast", {})).toBe("forecast in https://api.example.com");
      await connection.close();
      expect(await connection.stopped).toMatchObject({ reason: "closed" });
      expect(options.blocks).toEqual([]);
    });

    it("leaves the integration unable to read a file outside its folder", async () => {
      const options = bridgeOptions(fakeRunnerProcess(), {
        process: await startBuiltRunner(nosySource),
      });
      const connection = await connectRunner(options);
      await expect(connection.callTool("forecast", {})).rejects.toThrow(
        /access to this api has been restricted/i,
      );
      await connection.close();
    });
  });
});
