import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxBlock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SrtSandbox } from "./srt-sandbox.ts";
import { command, fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-session-network-test-"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

verifies("sandbox-srt.network-reports", () => {
  describe("a network request srt's proxy refused", () => {
    it("reaches the session's listeners as a network block", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(makeProfile(base));
      const blocks: SandboxBlock[] = [];
      session.onBlocked((block) => blocks.push(block));
      await session.start(command);
      runs[0]?.request.onNetworkBlock?.({ kind: "network", host: "blocked.example", port: 443 });
      expect(blocks).toEqual([{ kind: "network", host: "blocked.example", port: 443 }]);
      await session.close();
    });

    it("reaches no listener that has left", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(makeProfile(base));
      const blocks: SandboxBlock[] = [];
      session.onBlocked((block) => blocks.push(block))();
      await session.start(command);
      runs[0]?.request.onNetworkBlock?.({ kind: "network", host: "blocked.example", port: 443 });
      expect(blocks).toEqual([]);
      await session.close();
    });

    it("still reaches the other listeners when one throws, and the failure is logged", async () => {
      const { runner, runs } = fakeRunner();
      const warnings: string[] = [];
      const sandbox = new SrtSandbox(linux, runner, null, {
        warn: (message) => warnings.push(message),
      });
      const session = await sandbox.open(makeProfile(base));
      const blocks: SandboxBlock[] = [];
      session.onBlocked(() => {
        throw new Error("listener broke");
      });
      session.onBlocked((block) => blocks.push(block));
      await session.start(command);
      runs[0]?.request.onNetworkBlock?.({ kind: "network", host: "blocked.example", port: 443 });
      expect(blocks).toEqual([{ kind: "network", host: "blocked.example", port: 443 }]);
      expect(warnings).toEqual(["a listener for refused accesses failed: listener broke"]);
      await session.close();
    });

    it("is asked for on every program, and not on the fence probe, which runs before any listener", async () => {
      const { runner, runs, probes } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(makeProfile(base));
      await session.start(command);
      expect(runs[0]?.request.onNetworkBlock).toBeTypeOf("function");
      expect(probes.map((probe) => probe.onNetworkBlock)).toEqual([undefined]);
      await session.close();
    });
  });
});
