import { secretForms } from "@halonicjs/integration-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HalonicFrame } from "../frames.ts";
import {
  bridgeOptions,
  fakeRunnerProcess,
  fakeSecret,
  HandDrivenRunner,
} from "../pipes.test-helper.ts";
import { type ConnectRunnerOptions, connectRunner } from "./connect-runner.ts";
import { RunnerCallTimeoutError, RunnerStoppedError, RunnerToolError } from "./limits.ts";

/** A started connection, with every frame Halonic sends collected in `seen`. */
async function startedRunner(overrides: Partial<ConnectRunnerOptions> = {}) {
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake, overrides);
  const runner = new HandDrivenRunner(fake);
  const connecting = connectRunner(options);
  await runner.start();
  const connection = await connecting;
  const seen: HalonicFrame[] = [];
  void (async () => {
    for (;;) seen.push(await runner.next());
  })().catch(() => undefined);
  return { fake, options, runner, connection, seen };
}

/** Lets the streams pass on what is queued, without moving the clock. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function framesOfType<T extends HalonicFrame["type"]>(seen: HalonicFrame[], type: T) {
  return seen.filter((frame): frame is Extract<HalonicFrame, { type: T }> => frame.type === type);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("integration-runner.call-limits", () => {
  describe("cancel and the call deadline", () => {
    it("fails a call at once when its signal aborts, and stops a runner that doesn't answer within 5 s", async () => {
      const { fake, connection, seen } = await startedRunner();
      const abort = new AbortController();
      const result = connection.callTool("forecast", {}, abort.signal);
      result.catch(() => undefined);
      await settle();
      abort.abort(new DOMException("the user cancelled", "AbortError"));
      await expect(result).rejects.toThrow("the user cancelled");
      await settle();
      expect(framesOfType(seen, "cancel")).toEqual([{ type: "cancel", call: 0 }]);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(fake.kills()).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(await connection.stopped).toEqual({ reason: "call-deadline" });
      expect(fake.kills()).toBe(1);
    });

    it("takes the late answer of a cancelled call within the grace, and keeps the runner", async () => {
      const { fake, runner, connection } = await startedRunner({
        limits: { pingIntervalMs: 60_000 },
      });
      const abort = new AbortController();
      const result = connection.callTool("forecast", {}, abort.signal);
      result.catch(() => undefined);
      await settle();
      abort.abort();
      await runner.send({ type: "result", call: 0, text: "too late" });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fake.kills()).toBe(0);
      await connection.close();
    });

    it("cancels a call that runs past the time limit, even without a signal (A21)", async () => {
      const { connection, seen } = await startedRunner({ limits: { callTimeoutMs: 60_000 } });
      const result = connection.callTool("forecast", {});
      result.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(result).rejects.toBeInstanceOf(RunnerCallTimeoutError);
      expect(framesOfType(seen, "cancel")).toEqual([{ type: "cancel", call: 0 }]);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await connection.stopped).toEqual({ reason: "call-deadline" });
    });

    it("calls no tool the sheet doesn't declare", async () => {
      const { connection, seen } = await startedRunner();
      await expect(connection.callTool("delete_everything", {})).rejects.toThrow(
        'the integration has no tool named "delete_everything"',
      );
      await settle();
      expect(framesOfType(seen, "call")).toEqual([]);
      await connection.close();
    });
  });

  describe("ping between calls (A37)", () => {
    it("pings every 5 s between calls and keeps a runner that answers", async () => {
      const { fake, runner, connection, seen } = await startedRunner();
      for (const n of [0, 1, 2]) {
        await vi.advanceTimersByTimeAsync(5_000);
        expect(framesOfType(seen, "ping").at(-1)).toEqual({ type: "ping", n });
        await runner.send({ type: "pong", n });
        await settle();
      }
      expect(fake.kills()).toBe(0);
      await connection.close();
    });

    it("stops a runner that misses a pong by 1 s", async () => {
      const { runner, connection } = await startedRunner();
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(999);
      await runner.send({ type: "pong", n: 0 });
      await vi.advanceTimersByTimeAsync(5_000 + 1_000);
      expect(await connection.stopped).toEqual({ reason: "unresponsive" });
    });

    it("doesn't ping while a call runs, and pings again after it", async () => {
      const { runner, connection, seen } = await startedRunner();
      const result = connection.callTool("forecast", {});
      await vi.advanceTimersByTimeAsync(30_000);
      expect(framesOfType(seen, "ping")).toEqual([]);
      await runner.send({ type: "result", call: 0, text: "sunny" });
      expect(await result).toBe("sunny");
      await vi.advanceTimersByTimeAsync(5_000);
      expect(framesOfType(seen, "ping")).toEqual([{ type: "ping", n: 0 }]);
      await connection.close();
    });

    it("stops a runner that doesn't say ready within 10 s", async () => {
      const fake = fakeRunnerProcess();
      const connecting = connectRunner(bridgeOptions(fake));
      connecting.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(connecting).rejects.toMatchObject({ stop: { reason: "unresponsive" } });
      expect(fake.kills()).toBe(1);
    });
  });

  describe("the idle stop", () => {
    it("stops a runner after 2 minutes without a call", async () => {
      const { connection } = await startedRunner({ limits: { pingIntervalMs: 10 * 60_000 } });
      await vi.advanceTimersByTimeAsync(2 * 60_000 - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await connection.stopped).toEqual({ reason: "idle" });
      await expect(connection.callTool("forecast", {})).rejects.toBeInstanceOf(RunnerStoppedError);
    });

    it("counts the 2 minutes from the end of the last call", async () => {
      const { fake, runner, connection } = await startedRunner({
        limits: { pingIntervalMs: 10 * 60_000 },
      });
      await vi.advanceTimersByTimeAsync(90_000);
      const result = connection.callTool("forecast", {});
      await vi.advanceTimersByTimeAsync(90_000);
      await runner.send({ type: "result", call: 0, text: "sunny" });
      await result;
      await vi.advanceTimersByTimeAsync(90_000);
      expect(fake.kills()).toBe(0);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await connection.stopped).toEqual({ reason: "idle" });
    });
  });

  describe("what leaves the runner (A19, A21)", () => {
    it("filters secrets out of tool results and tool errors", async () => {
      const { runner, connection } = await startedRunner();
      const result = connection.callTool("forecast", {});
      await runner.send({ type: "result", call: 0, text: `key=${fakeSecret}` });
      expect(await result).toBe("key=[secret removed]");

      const failed = connection.callTool("forecast", {});
      await runner.send({ type: "result", call: 1, error: `Bearer ${fakeSecret} was refused` });
      await expect(failed).rejects.toEqual(
        new RunnerToolError("Bearer [secret removed] was refused"),
      );
      await connection.close();
    });

    it("filters stderr, keeps only the limit, and counts the rest", async () => {
      const { fake, options, runner, connection } = await startedRunner({
        limits: { maxStderrBytesPerCall: 40 },
      });
      const encoder = new TextEncoder();
      const result = connection.callTool("forecast", {});
      await fake.stderr.write(encoder.encode(`leaked ${fakeSecret}\n`));
      await fake.stderr.write(encoder.encode("x".repeat(100)));
      await fake.stderr.close();
      await settle();
      expect(options.log.join("")).toBe(
        `leaked [secret removed]\n${"x".repeat(16)}\n[84 bytes of output dropped]\n`,
      );
      await runner.send({ type: "result", call: 0, text: "" });
      await result;
      await connection.close();
    });

    it("counts the stderr limit again for each call", async () => {
      const { fake, options, runner, connection } = await startedRunner({
        limits: { maxStderrBytesPerCall: 40 },
        secrets: secretForms([]),
      });
      const encoder = new TextEncoder();
      for (const call of [0, 1]) {
        const result = connection.callTool("forecast", {});
        await fake.stderr.write(encoder.encode(`call ${call}:${"x".repeat(43)}`));
        await settle();
        await runner.send({ type: "result", call, text: "" });
        await result;
      }
      await fake.stderr.close();
      await settle();
      expect(options.log.join("")).toBe(
        `call 0:${"x".repeat(33)}\n[10 bytes of output dropped]\ncall 1:${"x".repeat(33)}\n[10 bytes of output dropped]\n`,
      );
      await connection.close();
    });
  });
});
