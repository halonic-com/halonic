// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import type { SandboxProfile } from "@halonicjs/ports";
import {
  type FakeProgram,
  FakeSandboxSession,
  idleProgram,
  readText,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

const profile: SandboxProfile = {
  workingFolder: "/fake/work",
  tempFolder: "/fake/temp",
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 1000,
};

const command = { program: "fake", args: [] };

/** Echoes each line of its input back, in capitals, until the input ends. */
const shouts: FakeProgram = async (io) => {
  for (let line = await io.readLine(); line !== null; line = await io.readLine()) {
    io.write(`${line.toUpperCase()}\n`);
  }
  return 0;
};

verifies("contracts.harness", () => {
  describe("FakeSandboxSession", () => {
    it("runs the program with its input and output, and reports how it exited", async () => {
      const session = new FakeSandboxSession({ profile, program: shouts });
      const process = await session.start(command);
      const input = process.stdin.getWriter();
      await input.write(new TextEncoder().encode("sea\nsky"));
      await input.close();

      expect(await readText(process.stdout)).toBe("SEA\nSKY\n");
      expect(await process.exited).toEqual({ code: 0, signal: null, reason: "exited" });
      expect(session.started).toEqual([command]);
      expect(session.running).toBe(0);
    });

    it("refuses to start once closed, and reports the fence as stopped", async () => {
      const session = new FakeSandboxSession({ profile, program: idleProgram });
      await session.close();

      await expect(session.start(command)).rejects.toThrow("closed");
      expect(session.fence).toEqual({ state: "stopped" });
    });

    it("refuses to start when the fence isn't proven", async () => {
      const fence = { state: "not-fenced", reason: "a probe got through" } as const;
      const session = new FakeSandboxSession({ profile, program: idleProgram, fence });

      await expect(session.start(command)).rejects.toThrow("a probe got through");
    });

    it("has stopped every program when close resolves", async () => {
      const session = new FakeSandboxSession({ profile, program: idleProgram });
      const first = await session.start(command);
      await session.start(command);
      expect(session.running).toBe(2);

      await session.close();
      expect(session.running).toBe(0);
      expect(await first.exited).toEqual({ code: null, signal: "SIGKILL", reason: "stopped" });
    });

    it("keeps a killed program running until kill resolves, as a real one takes a moment to die", async () => {
      const session = new FakeSandboxSession({ profile, program: idleProgram });
      const process = await session.start(command);

      const killing = process.kill();
      // A harness that doesn't wait for kill would look here, after the
      // program has seen the stop and returned.
      await Promise.resolve();
      await Promise.resolve();
      expect(session.running).toBe(1);

      const again = process.kill();
      await killing;
      expect(session.running).toBe(0);
      await again;
      expect(await process.exited).toEqual({ code: null, signal: "SIGKILL", reason: "stopped" });
    });

    it("stops a program whose output the reader cancelled", async () => {
      const session = new FakeSandboxSession({
        profile,
        program: async (io) => {
          io.write("before\n");
          await new Promise((resolve) => io.stopped.addEventListener("abort", resolve));
          io.write("after\n");
          return 0;
        },
      });
      const process = await session.start(command);
      await process.stdout.cancel();

      await process.kill();
      expect(await process.exited).toEqual({ code: null, signal: "SIGKILL", reason: "stopped" });
    });

    it("refuses input once the program has ended, as a closed pipe does", async () => {
      const session = new FakeSandboxSession({ profile, program: async () => 0 });
      const process = await session.start(command);
      await process.exited;

      const input = process.stdin.getWriter();
      await expect(input.write(new TextEncoder().encode("late\n"))).rejects.toThrow("has ended");
    });

    it("never rejects exited, even when the program throws", async () => {
      const session = new FakeSandboxSession({
        profile,
        program: async () => {
          throw new Error("the fake program broke");
        },
      });
      const process = await session.start(command);

      expect(await process.exited).toEqual({ code: 1, signal: null, reason: "exited" });
      expect(await readText(process.stderr)).toContain("the fake program broke");
    });

    it("passes blocked accesses to its listeners until they stop listening", () => {
      const session = new FakeSandboxSession({ profile, program: idleProgram });
      const heard: string[] = [];
      const stop = session.onBlocked((block) => heard.push(block.kind));

      session.block({ kind: "network", host: "example.com", port: 443 });
      stop();
      session.block({ kind: "file", path: "/fake/secret", access: "read" });
      expect(heard).toEqual(["network"]);
    });
  });
});
