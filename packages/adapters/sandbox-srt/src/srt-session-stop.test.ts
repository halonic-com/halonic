import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SrtSandbox } from "./srt-sandbox.ts";
import { command, fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

let base: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "srt-session-stop-test-")));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(base, { recursive: true, force: true });
});

const profile = (overrides: Partial<SandboxProfile> = {}) => makeProfile(base, overrides);

verifies("sandbox-srt.session", () => {
  describe("stopping programs", () => {
    it("kill ends the whole tree, says it was stopped and is safe to call twice", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const started = await session.start(command);
      await started.kill();
      await started.kill();
      expect(runs[0]?.killed).toBe(true);
      expect(await started.exited).toEqual({ code: null, signal: "SIGKILL", reason: "stopped" });
      await session.close();
    });

    it("close stops every program and is safe to call twice", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const one = await session.start(command);
      const two = await session.start(command);
      await Promise.all([session.close(), session.close()]);
      expect(runs.map((run) => run.killed)).toEqual([true, true]);
      expect((await one.exited).reason).toBe("stopped");
      expect((await two.exited).reason).toBe("stopped");
    });

    it("stops a program that was still launching when the session closed", async () => {
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const starting = session.start(command);
      const closing = session.close();
      const started = await starting;
      await closing;
      expect(runs[0]?.killed).toBe(true);
      expect((await started.exited).reason).toBe("stopped");
    });

    it("stops everything when the time limit runs out, counted from open", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile({ timeLimitMs: 5000 }));
      const started = await session.start(command);
      await vi.advanceTimersByTimeAsync(5000);
      expect(runs[0]?.killed).toBe(true);
      expect(await started.exited).toEqual({ code: null, signal: "SIGKILL", reason: "timeout" });
      expect(session.fence).toEqual({ state: "stopped" });
    });

    it("says timeout for a program still launching when the time limit runs out", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      const { runner, runs } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile({ timeLimitMs: 5000 }));
      const starting = session.start(command);
      await vi.advanceTimersByTimeAsync(5000);
      const started = await starting;
      expect(runs[0]?.killed).toBe(true);
      expect((await started.exited).reason).toBe("timeout");
    });

    it("stops everything when the signal aborts, and at once when it is aborted already", async () => {
      const { runner, runs } = fakeRunner();
      const controller = new AbortController();
      const session = await new SrtSandbox(linux, runner).open(profile(), {
        signal: controller.signal,
      });
      const started = await session.start(command);
      controller.abort();
      expect((await started.exited).reason).toBe("stopped");
      expect(runs[0]?.killed).toBe(true);
      await session.close();
      expect(session.fence).toEqual({ state: "stopped" });

      const late = await new SrtSandbox(linux, runner).open(profile(), {
        signal: AbortSignal.abort(),
      });
      await late.close();
      expect(late.fence).toEqual({ state: "stopped" });
    });

    it("lets a listener leave twice without trouble", async () => {
      const { runner } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile());
      const leave = session.onBlocked(() => {});
      expect(() => {
        leave();
        leave();
      }).not.toThrow();
      await session.close();
    });
  });
});
