import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

// Asks Node for its file system binding, which the module hook can't see and
// only Node's permission layer refuses.
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

/**
 * An integration whose tool runs `attempt` and answers with what it got, or
 * with the error. Each attempt is one way around the static import checks
 * (attack case A34).
 */
function attempting(attempt: string): string {
  return `export const weather = {
  name: "weather",
  version: "1.0.0",
  tools: [],
  connect: () => ({
    callTool: async () => {
      try {
        return "got " + typeof (await (async () => { ${attempt} })());
      } catch (error) {
        return "refused: " + error.message;
      }
    },
    close: async () => undefined,
  }),
};
`;
}

let folder: string;
let runner: RunnerFile;

beforeAll(async () => {
  // The real path, as the runner gets in production: Node resolves modules to
  // their real paths, and tmpdir() is a symlink on macOS.
  folder = await realpath(await mkdtemp(join(tmpdir(), "runner-file-")));
  runner = await buildRunnerFile(join(folder, "dist", "runner.mjs"));
  await writeFile(join(folder, "outside.mjs"), "export default 1;");
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** How a test starts the built runner. */
interface StartOptions {
  /** Further files in the integration's folder, by their path inside it. */
  readonly files?: Readonly<Record<string, string>>;
  /** Whether Node's permission layer is on; off shows what the module hook stops on its own. */
  readonly nodeLayer?: boolean;
}

/** Starts the built runner as Node would inside the fence, without the fence itself. */
async function startBuiltRunner(
  source: string,
  { files = {}, nodeLayer = true }: StartOptions = {},
): Promise<SandboxProcess> {
  const integrationFolder = join(folder, `integration-${Math.random().toString(36).slice(2)}`);
  await mkdir(integrationFolder);
  const entryFile = join(integrationFolder, "index.mjs");
  await writeFile(entryFile, source);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(integrationFolder, name)), { recursive: true });
    await writeFile(join(integrationFolder, name), content);
  }
  const command = runnerCommand(
    { node: process.execPath, nodeFolder: "", runnerFile: runner.path, integrationFolder },
    { nonce: testNonce, folder: integrationFolder, entryFile, exportName: "weather" },
  );
  const args = nodeLayer ? command.args : command.args.filter((arg) => !arg.startsWith("--"));
  const child = spawn(command.program, args, { stdio: ["pipe", "pipe", "pipe"], env: {} });
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

    it("leaves the integration no file system binding", async () => {
      const options = bridgeOptions(fakeRunnerProcess(), {
        process: await startBuiltRunner(nosySource),
      });
      const connection = await connectRunner(options);
      await expect(connection.callTool("forecast", {})).rejects.toThrow(/process\.binding/);
      await connection.close();
    });
  });
});

/** Calls the attempting integration's tool once and returns its answer. */
async function answerTo(source: string, options: StartOptions): Promise<unknown> {
  const bridge = bridgeOptions(fakeRunnerProcess(), {
    process: await startBuiltRunner(source, options),
  });
  const connection = await connectRunner(bridge);
  try {
    return await connection.callTool("forecast", {});
  } finally {
    await connection.close();
  }
}

verifies("integration-runner.module-fence", () => {
  describe.each([
    { layer: "with Node's permission layer", nodeLayer: true },
    { layer: "with the module hook alone", nodeLayer: false },
  ])("the built runner, $layer", ({ nodeLayer }) => {
    it.each([
      ["import node:fs", 'return import("node:fs");'],
      ["import fs by its bare name", 'return import("fs");'],
      ["import node:module for createRequire", 'return import("node:module");'],
      ["import a data: URL", 'return import("data:text/javascript,export default 1");'],
      ["import ../ out of its folder", 'return import("../outside.mjs");'],
      ["import another package", 'return import("left-pad");'],
      ["require fs from a CommonJS file", 'return import("./reach.cjs");'],
      ["require a native add-on from a CommonJS file", 'return import("./reach-addon.cjs");'],
      ["resolve node:fs with import.meta.resolve", 'return import.meta.resolve("node:fs");'],
    ])("refuses an integration that tries to %s", async (_name, attempt) => {
      const answer = await answerTo(attempting(attempt), {
        nodeLayer,
        files: {
          "reach.cjs": 'module.exports = require("fs");',
          "reach-addon.cjs": 'module.exports = require("./x.node");',
          // Only has to resolve: the hook refuses it before Node would load it.
          "x.node": "",
        },
      });
      expect(answer).toMatch(/^refused: The runner refused an import/);
    });

    it("leaves no process.getBuiltinModule to hand out Node's modules", async () => {
      const answer = await answerTo(attempting("return process.getBuiltinModule;"), { nodeLayer });
      expect(answer).toBe("got undefined");
    });

    it("loads the integration's own files from inside its folder", async () => {
      const answer = await answerTo(attempting('return (await import("./lib/a.mjs")).a;'), {
        nodeLayer,
        files: {
          "lib/a.mjs": 'export { b as a } from "../b.mjs";',
          "b.mjs": "export const b = 1;",
        },
      });
      expect(answer).toBe("got number");
    });
  });
});
