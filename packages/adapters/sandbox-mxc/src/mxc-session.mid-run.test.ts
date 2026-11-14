import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeMxc, healthyBox, nodeFolder, nodeProgram, testBoxes } from "./fake-mxc.test-helper.ts";
import type { MxcMachine } from "./machine.ts";
import { MemoryDisk } from "./memory-disk.test-helper.ts";
import type { MxcProcess } from "./mxc-process.ts";
import { MxcSandbox } from "./mxc-sandbox.ts";

// Made-up Windows paths, each marked for the leak guard on its own line.
const work = "C:\\acme\\work"; // leak-guard: allow absolute-path made-up Windows path for a test
const temp = "C:\\acme\\temp"; // leak-guard: allow absolute-path made-up Windows path for a test

const profile: SandboxProfile = {
  workingFolder: work,
  tempFolder: temp,
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 10_000,
};

const program = { program: "C:\\acme\\tools\\agent.exe", args: [] as string[] }; // leak-guard: allow absolute-path made-up Windows path for a test

/**
 * The adapter on a fake SDK that works for the fence proof and then fails
 * (attack case A23, MXC fails mid-run). `afterProof` makes the `spawn` used
 * once `breakNow` has been called, from the healthy one.
 */
function setup(afterProof: (healthy: MxcMachine["spawn"]) => MxcMachine["spawn"]) {
  const disk = new MemoryDisk().folder(work).folder(nodeFolder);
  const fake = new FakeMxc(disk, healthyBox(disk));
  const { boxes, made } = testBoxes(disk);
  const healthy = fake.machine();
  const failing = afterProof(healthy.spawn);
  let broken = false;
  const machine: MxcMachine = {
    ...healthy,
    spawn: (request, options) => (broken ? failing : healthy.spawn)(request, options),
  };
  return {
    fake,
    sandbox: new MxcSandbox(machine, boxes, { disk, nodeProgram }),
    breakNow: () => {
      broken = true;
    },
    /** Whether every box folder made so far is gone. */
    async boxesGone() {
      const kinds = await Promise.all(made().map((path) => disk.kind(path)));
      return kinds.every((kind) => kind === "missing");
    },
  };
}

verifies("sandbox-mxc.session", () => {
  describe("MXC failing mid-run (A23)", () => {
    it("starts nothing when MXC can't start the program, and closes with the box folder removed", async () => {
      const { sandbox, breakNow, boxesGone } = setup(() => async () => {
        throw new Error("MXC went away");
      });
      const session = await sandbox.open(profile);
      expect(session.fence).toEqual({ state: "fenced" });
      breakNow();
      await expect(session.start(program)).rejects.toThrow("MXC went away");
      // A second try fails the same way: nothing falls back to running without the fence.
      await expect(session.start(program)).rejects.toThrow("MXC went away");
      await session.close();
      expect(session.fence).toEqual({ state: "stopped" });
      expect(await boxesGone()).toBe(true);
    });

    it("reports a program MXC loses track of as a failure, not a clean exit", async () => {
      const { sandbox, breakNow } = setup(
        () => async (): Promise<MxcProcess> => ({
          standardInput: null,
          standardOutput: null,
          standardError: null,
          wait: () => Promise.reject(new Error("the SDK lost the process")),
          kill: () => undefined,
          dispose: () => undefined,
        }),
      );
      const session = await sandbox.open(profile);
      breakNow();
      const started = await session.start(program);
      expect((await started.exited).code).not.toBe(0);
      await session.close();
    });

    it("says so when a program can't be killed, and still removes the box folder and starts nothing more", async () => {
      const { sandbox, fake, breakNow, boxesGone } = setup(
        (healthy) => async (request, options) => ({
          ...(await healthy(request, options)),
          kill: () => Promise.reject(new Error("MXC refused to kill")),
        }),
      );
      const session = await sandbox.open(profile);
      fake.behave(() => ({ hang: true }));
      breakNow();
      await session.start(program);
      await expect(session.close()).rejects.toThrow("MXC refused to kill");
      expect(session.fence).toEqual({ state: "stopped" });
      expect(await boxesGone()).toBe(true);
      await expect(session.start(program)).rejects.toThrow("closed");
    });
  });
});
