import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runnerNodeFolder, runnerProfile } from "@halonicjs/adapter-integration-runner";
import { MemoryUnfencedRunConsentStore } from "@halonicjs/adapter-memory";
import { RunnerStartGate, UnfencedRuns } from "@halonicjs/app";
import type { Sandbox } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type HostPluginMachineOptions, hostPluginMachine } from "./host-plugin-machine.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-host-machine-"));
  await mkdir(join(root, "shared"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const unusedSandbox: Sandbox = {
  check: async () => ({ ok: true, reason: null, missing: [] }),
  capabilities: () => ({ files: "shared", strength: "os" }),
  open: async () => {
    throw new Error("this test never opens a session");
  },
};

function machineOf(extra: Partial<HostPluginMachineOptions> = {}) {
  return hostPluginMachine({
    ...extra,
    gate: new RunnerStartGate({
      platform: process.platform,
      fenced: unusedSandbox,
      launcher: unusedSandbox,
      runs: new UnfencedRuns({
        store: new MemoryUnfencedRunConsentStore(),
        clock: { now: () => new Date(0) },
        timers: { set: () => undefined, clear: () => undefined },
      }),
      timers: { set: () => undefined, clear: () => undefined },
    }),
    // On Windows the runner's temp folder goes in the profile's shared data folder: a folder of this test's own, not the machine's %ProgramData%.
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      root,
      sharedDataFolder: join(root, "shared"),
    },
    version: "0.0.0",
  });
}

verifies("agent-host.plugin-routes", () => {
  describe("the host's plugin machine", () => {
    it("gives the runner the read-only grant the fence's attack cases run against", async () => {
      const { machine, dispose } = machineOf();
      try {
        const { runtime } = machine;
        // The attack suite builds this folder through the same function.
        expect(runtime.nodeFolder).toBe(runnerNodeFolder(process.execPath));
        const runnerMachine = await machine.runnerMachine();
        const identity = { listFolder: () => [], realPath: (path: string) => path };
        const profile = runnerProfile(
          { ...runtime, integrationFolder: join(root, "plugins", "acme") },
          { ...runnerMachine, platform: "linux" },
          identity,
        );
        expect(profile.readOnlyPaths).toEqual([
          dirname(process.execPath),
          runtime.runnerFile,
          join(root, "plugins", "acme"),
          ...runnerMachine.sandboxFolders,
        ]);
        expect(profile.readOnlyPaths).not.toContain(dirname(dirname(process.execPath)));
      } finally {
        await dispose();
      }
    });

    it("lets an integration's requests reach this computer, which the sheet then limits", async () => {
      const server = createServer((_request, response) => response.end("ok"));
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const { machine, dispose } = machineOf();
      try {
        const { port } = server.address() as AddressInfo;
        const response = await machine.transport.fetch(`http://localhost:${port}/`);
        expect(await response.text()).toBe("ok");
      } finally {
        await dispose();
        await new Promise((done) => server.close(done));
      }
    });

    it("removes a start's temp folder when the start fails", async () => {
      const { machine, dispose } = machineOf();
      try {
        const runnerMachine = await machine.runnerMachine();
        const tempParent = dirname(runnerMachine.tempFolder);
        expect(await readdir(tempParent)).toHaveLength(1);
        const start = machine.startRunner;
        if (start === undefined) throw new Error("the host machine must start runners itself");
        await expect(
          start({
            files: { ...machine.runtime, integrationFolder: join(root, "missing") },
            machine: runnerMachine,
          } as never),
        ).rejects.toThrow();
        expect(await readdir(tempParent)).toHaveLength(0);
      } finally {
        await dispose();
      }
    });

    const failingRemoval = Object.assign(new Error(`EACCES: cannot remove ${"/secret/folder"}`), {
      code: "EACCES",
    });

    it("keeps the start's own error and logs the removal that failed, without the path", async () => {
      const logged: string[] = [];
      const { machine, dispose } = machineOf({
        removeFolder: async () => {
          throw failingRemoval;
        },
        log: (text) => logged.push(text),
        start: async () => {
          throw new Error("the runner did not start");
        },
      });
      try {
        const runnerMachine = await machine.runnerMachine();
        await expect(machine.startRunner?.({ machine: runnerMachine } as never)).rejects.toThrow(
          "the runner did not start",
        );
        expect(logged, JSON.stringify(logged)).toHaveLength(1);
        expect(logged[0]).toContain("EACCES");
        expect(logged[0]).not.toContain("/secret/folder");
      } finally {
        await dispose().catch(() => undefined);
      }
    });

    it("logs the removal that failed after a runner stops, with no unhandled rejection", async () => {
      const logged: string[] = [];
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      let stop: () => void = () => undefined;
      const stopped = new Promise<void>((resolve) => {
        stop = resolve;
      });
      const { machine, dispose } = machineOf({
        removeFolder: async () => {
          throw failingRemoval;
        },
        log: (text) => logged.push(text),
        start: async () => ({ stopped }) as never,
      });
      try {
        const runnerMachine = await machine.runnerMachine();
        await machine.startRunner?.({ machine: runnerMachine } as never);
        stop();
        await stopped;
        await vi.waitFor(() => expect(logged).toHaveLength(1));
        // One more turn, so an unhandled rejection would have been reported.
        await new Promise((resolve) => setImmediate(resolve));
        expect(unhandled).toEqual([]);
        expect(logged[0]).not.toContain("/secret/folder");
      } finally {
        process.off("unhandledRejection", onUnhandled);
        await dispose().catch(() => undefined);
      }
    });
  });
});
