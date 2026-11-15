import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runnerNodeFolder, runnerProfile } from "@halonicjs/adapter-integration-runner";
import type { Sandbox } from "@halonicjs/ports";
import { runnerTempFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hostPluginMachine } from "./host-plugin-machine.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-host-machine-"));
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

function machineOf() {
  return hostPluginMachine({
    fenced: unusedSandbox,
    profile: { platform: process.platform === "win32" ? "windows" : "linux", root },
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

    it("removes a start's temp folder when the start fails", async () => {
      const { machine, dispose } = machineOf();
      try {
        const runnerMachine = await machine.runnerMachine();
        expect(await readdir(runnerTempFolder({ platform: "linux", root }))).toHaveLength(1);
        const start = machine.startRunner;
        if (start === undefined) throw new Error("the host machine must start runners itself");
        await expect(
          start({
            files: { ...machine.runtime, integrationFolder: join(root, "missing") },
            machine: runnerMachine,
          } as never),
        ).rejects.toThrow();
        expect(await readdir(runnerTempFolder({ platform: "linux", root }))).toHaveLength(0);
      } finally {
        await dispose();
      }
    });
  });
});
