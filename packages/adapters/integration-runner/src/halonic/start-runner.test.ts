import type {
  Sandbox,
  SandboxBlockListener,
  SandboxCommand,
  SandboxFence,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  bridgeOptions,
  type FakeRunnerProcess,
  fakeRunnerProcess,
  HandDrivenRunner,
} from "../pipes.test-helper.ts";
import { readRunnerArgs } from "../runner-args.ts";
import { RunnerStoppedError } from "./limits.ts";
import { type StartRunnerOptions, startRunner } from "./start-runner.ts";

/** A sandbox whose sessions start fake runners, and that records what it was asked. */
class FakeSandbox implements Sandbox {
  readonly profiles: SandboxProfile[] = [];
  readonly commands: SandboxCommand[] = [];
  readonly runners: FakeRunnerProcess[] = [];
  closedSessions = 0;
  readonly fence: SandboxFence;
  #listeners: SandboxBlockListener[] = [];

  constructor(fence: SandboxFence = { state: "fenced" }) {
    this.fence = fence;
  }

  async check() {
    return { ok: true } as Awaited<ReturnType<Sandbox["check"]>>;
  }

  capabilities() {
    return {} as ReturnType<Sandbox["capabilities"]>;
  }

  async open(profile: SandboxProfile): Promise<SandboxSession> {
    this.profiles.push(profile);
    const sandbox = this;
    let closed = false;
    return {
      profile,
      fence: this.fence,
      async start(command) {
        if (sandbox.fence.state !== "fenced") throw new Error("the fence proof failed");
        sandbox.commands.push(command);
        const runner = fakeRunnerProcess();
        sandbox.runners.push(runner);
        return runner.process;
      },
      onBlocked(listener) {
        sandbox.#listeners.push(listener);
        return () => {
          sandbox.#listeners = sandbox.#listeners.filter((other) => other !== listener);
        };
      },
      async close() {
        if (closed) return;
        closed = true;
        sandbox.closedSessions += 1;
      },
    };
  }

  /** Reports a block to every session still listening. */
  block(path: string): void {
    for (const listener of this.#listeners) listener({ kind: "file", path, access: "read" });
  }

  /** The nonce the last runner was started with. */
  lastNonce(): string {
    const command = this.commands.at(-1);
    if (command === undefined) throw new Error("no runner was started");
    return readRunnerArgs(command.args.slice(4)).nonce;
  }
}

const folder = "/work/integrations/weather";

/** Symlinks on the fake disk, and where they point. */
const links: Record<string, string> = {
  "/usr/local/node": "/usr",
  "/work/linked-weather": folder,
  [`${folder}/linked-entry.js`]: "/work/integrations/other/index.js",
};
/** Resolves a link anywhere on the path, as `realpath` does. */
function realPath(path: string): string {
  for (const [link, target] of Object.entries(links)) {
    if (path === link || path.startsWith(`${link}/`)) return target + path.slice(link.length);
  }
  return path;
}
const fakeDisk = { listFolder: () => [], realPath };

function startOptions(sandbox: FakeSandbox): StartRunnerOptions & { blocks: unknown[] } {
  const { process: _process, nonce: _nonce, ...connect } = bridgeOptions(fakeRunnerProcess());
  return {
    ...connect,
    sandbox,
    files: {
      node: "/usr/bin/node",
      nodeFolder: "/usr",
      runnerFile: "/opt/halonic/runner.js",
      integrationFolder: folder,
    },
    entry: { file: `${folder}/index.js`, exportName: "weather" },
    disk: fakeDisk,
    machine: {
      homeFolder: "/fake-home",
      socketFolders: ["/run"],
      tempFolder: "/fake-temp/halonic-run",
      timeLimitMs: 60_000,
    },
  };
}

/** Starts a runner and plays its side until `start`. */
async function started(sandbox: FakeSandbox, options = startOptions(sandbox)) {
  const starting = startRunner(options);
  await until(() => sandbox.runners.length === 1);
  const runner = new HandDrivenRunner(sandbox.runners[0] as FakeRunnerProcess);
  expect(await runner.start(sandbox.lastNonce())).toMatchObject({ type: "start" });
  return { connection: await starting, runner, options };
}

async function until(done: () => boolean): Promise<void> {
  while (!done()) await new Promise((resolve) => setTimeout(resolve, 1));
}

verifies("integration-runner.start", () => {
  describe("startRunner", () => {
    it("starts the runner in a session of its own with the untrusted profile", async () => {
      const sandbox = new FakeSandbox();
      const { connection } = await started(sandbox);
      expect(connection.fence).toEqual({ state: "fenced" });
      const profile = sandbox.profiles[0];
      expect(profile?.network).toEqual({ bridge: null, allowedSites: [] });
      expect(profile?.env).toEqual({ TMPDIR: "/fake-temp/halonic-run" });
      expect(profile?.deniedPaths).toEqual(["/fake-home", "/run"]);
      expect(sandbox.commands[0]?.args.slice(0, 4)).toEqual([
        "--permission",
        "--allow-fs-read=/opt/halonic/runner.js",
        `--allow-fs-read=${folder}`,
        "/opt/halonic/runner.js",
      ]);
      await connection.close();
    });

    it("gives every start a fresh nonce", async () => {
      const sandbox = new FakeSandbox();
      const first = await started(sandbox);
      const firstNonce = sandbox.lastNonce();
      await first.connection.close();
      sandbox.runners.length = 0;
      const second = await started(sandbox);
      expect(sandbox.lastNonce()).not.toBe(firstNonce);
      await second.connection.close();
    });

    it("refuses a runner that says ready with another start's nonce", async () => {
      const sandbox = new FakeSandbox();
      const starting = startRunner(startOptions(sandbox));
      await until(() => sandbox.runners.length === 1);
      const runner = new HandDrivenRunner(sandbox.runners[0] as FakeRunnerProcess);
      await runner.send({ type: "ready", nonce: "an-old-nonce" });
      await expect(starting).rejects.toBeInstanceOf(RunnerStoppedError);
      expect(sandbox.closedSessions).toBe(1);
    });

    it("closes the session and connects nothing when the fence proof failed", async () => {
      const sandbox = new FakeSandbox({ state: "not-fenced", reason: "a probe got through" });
      await expect(startRunner(startOptions(sandbox))).rejects.toThrow(/fence proof/);
      expect(sandbox.runners).toHaveLength(0);
      expect(sandbox.closedSessions).toBe(1);
    });

    it("closes the session when the runner ends by itself", async () => {
      const sandbox = new FakeSandbox();
      const { connection } = await started(sandbox);
      sandbox.runners[0]?.exit(1);
      expect(await connection.stopped).toMatchObject({ reason: "exited" });
      await until(() => sandbox.closedSessions === 1);
    });

    it("closes the session with the connection", async () => {
      const sandbox = new FakeSandbox();
      const { connection } = await started(sandbox);
      await connection.close();
      expect(sandbox.closedSessions).toBe(1);
      expect(sandbox.runners[0]?.kills()).toBeGreaterThan(0);
    });

    it("reports what the fence refused, until the session closes", async () => {
      const sandbox = new FakeSandbox();
      const { connection, options } = await started(sandbox);
      sandbox.block("/fake-home/.ssh/id_ed25519");
      expect(options.blocks).toEqual([
        {
          kind: "fence",
          block: { kind: "file", path: "/fake-home/.ssh/id_ed25519", access: "read" },
        },
      ]);
      await connection.close();
      sandbox.block("/etc/shadow");
      expect(options.blocks).toHaveLength(1);
    });

    it("opens no session for an entry file outside the integration's folder", async () => {
      const sandbox = new FakeSandbox();
      const options = startOptions(sandbox);
      for (const file of [folder, "/work/integrations/other/index.js", `${folder}/../other.js`]) {
        await expect(
          startRunner({ ...options, entry: { file, exportName: "weather" } }),
        ).rejects.toThrow(/not inside its folder/);
      }
      expect(sandbox.profiles).toHaveLength(0);
    });

    it("starts the runner from the real paths", async () => {
      const sandbox = new FakeSandbox();
      const options = startOptions(sandbox);
      const { connection } = await started(sandbox, {
        ...options,
        files: {
          ...options.files,
          nodeFolder: "/usr/local/node",
          integrationFolder: "/work/linked-weather",
        },
        entry: { file: "/work/linked-weather/index.js", exportName: "weather" },
      });
      expect(sandbox.profiles[0]?.readOnlyPaths).toEqual([
        "/usr",
        "/opt/halonic/runner.js",
        folder,
      ]);
      expect(sandbox.commands[0]?.args.slice(2)).toEqual([
        `--allow-fs-read=${folder}`,
        "/opt/halonic/runner.js",
        sandbox.lastNonce(),
        `${folder}/index.js`,
        "weather",
      ]);
      await connection.close();
    });

    it("opens no session for an entry file that links out of the integration's folder", async () => {
      const sandbox = new FakeSandbox();
      const options = startOptions(sandbox);
      await expect(
        startRunner({
          ...options,
          entry: { file: `${folder}/linked-entry.js`, exportName: "weather" },
        }),
      ).rejects.toThrow(/not inside its folder/);
      expect(sandbox.profiles).toHaveLength(0);
    });

    it.each([
      ["Node's folder", { files: { nodeFolder: "/" } }],
      ["runner file", { files: { runnerFile: "/run" } }],
      ["integration's folder", { files: { integrationFolder: "/fake-home" } }],
      ["temp folder", { machine: { tempFolder: "/run" } }],
    ])(
      "opens no session when the %s is or holds a folder the fence hides",
      async (name, change) => {
        const sandbox = new FakeSandbox();
        const options = startOptions(sandbox);
        const files = { ...options.files, ...("files" in change ? change.files : {}) };
        const machine = { ...options.machine, ...("machine" in change ? change.machine : {}) };
        const entry = { file: `${files.integrationFolder}/index.js`, exportName: "weather" };
        await expect(startRunner({ ...options, files, machine, entry })).rejects.toThrow(
          `the ${name} `,
        );
        expect(sandbox.profiles).toHaveLength(0);
      },
    );
  });
});
