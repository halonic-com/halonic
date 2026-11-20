import { PassThrough } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ControlFrameDecoder } from "./control-frames.ts";
import {
  type EngineHealth,
  type EngineRoleParts,
  healthEveryMs,
  type RunningEngine,
  runEngineRole,
  type SandboxHostConnection,
} from "./engine-role.ts";

const token = "a".repeat(43);

/** A frame as the shell writes it: the length, then the JSON. */
function shellFrame(json: string): Buffer {
  const bytes = Buffer.from(json, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

/** Lets the stream events and promise steps that are queued run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** What a fake engine was asked to do, in order. */
interface EngineLog {
  steps: string[];
  graceMs: number[];
  sandboxHosts: SandboxHostConnection[];
}

interface FakeEngineOptions {
  interrupted?: number;
  settleFails?: boolean;
}

/** An engine that records what it is asked, with its health changes under the test's control. */
function fakeEngine(options: FakeEngineOptions = {}) {
  const log: EngineLog = { steps: [], graceMs: [], sandboxHosts: [] };
  let health: EngineHealth = { scheduling: true, activeRuns: 0, lastTick: null };
  const listeners = new Set<() => void>();
  const engine: RunningEngine = {
    url: "http://127.0.0.1:41234",
    token,
    health: () => health,
    useSandboxHost: (connection) => log.sandboxHosts.push(connection),
    followHealth(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stopScheduling: () => log.steps.push("stopScheduling"),
    async settle(graceMs) {
      log.steps.push("settle");
      log.graceMs.push(graceMs);
      if (options.settleFails) throw new Error("The run store is read-only.");
      return options.interrupted ?? 0;
    },
    async close() {
      log.steps.push("close");
    },
  };
  const changeHealth = (next: EngineHealth) => {
    health = next;
    for (const listener of listeners) listener();
  };
  return { engine, log, changeHealth, listeners };
}

/** Runs the engine role on fake pipes, with a timer the test fires by hand. */
function startRole(open: EngineRoleParts["open"]) {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  const ticks = new Set<() => void>();
  const errors: string[] = [];
  const exit = runEngineRole(input, output, {
    open,
    every(tick, ms) {
      expect(ms).toBe(healthEveryMs);
      ticks.add(tick);
      return () => ticks.delete(tick);
    },
    writeError: (text) => errors.push(text),
  });
  /** The frames written since the last call. */
  const written = async () => {
    await settle();
    return new ControlFrameDecoder().push(Buffer.concat(chunks.splice(0)));
  };
  const tick = () => {
    for (const each of ticks) each();
  };
  return { input, exit, written, errors, ticks, tick };
}

const healthy = { kind: "health", scheduling: true, activeRuns: 0, lastTick: null };

verifies("agent-host.engine-role-lifecycle", () => {
  describe("while it runs", () => {
    it("sends the handshake, then its health now, on a change and on the timer", async () => {
      const { engine, changeHealth } = fakeEngine();
      const role = startRole(async () => engine);
      expect(await role.written()).toEqual([
        { kind: "handshake", protocol: 1, url: "http://127.0.0.1:41234", token },
        healthy,
      ]);
      const busy = { scheduling: true, activeRuns: 2, lastTick: "2026-11-20T08:00:00.000Z" };
      changeHealth(busy);
      role.tick();
      expect(await role.written()).toEqual([
        { kind: "health", ...busy },
        { kind: "health", ...busy },
      ]);
      role.input.end();
      await role.exit;
    });

    it("hands the engine the sandbox host, also one that came while it opened", async () => {
      const { engine, log } = fakeEngine();
      let opened: (value: RunningEngine) => void = () => {};
      const role = startRole(() => new Promise((resolve) => (opened = resolve)));
      role.input.write(shellFrame('{"kind":"sandbox_host","connection":null}'));
      await settle();
      opened(engine);
      await settle();
      role.input.write(
        shellFrame('{"kind":"sandbox_host","connection":{"url":"http://127.0.0.1:5","token":"t"}}'),
      );
      await settle();
      expect(log.sandboxHosts).toEqual([null, { url: "http://127.0.0.1:5", token: "t" }]);
      role.input.end();
      await role.exit;
    });

    it("writes nothing and exits with 1 when the engine can't open", async () => {
      const role = startRole(async () => {
        throw new Error("The lock engine.lock is held by another process.");
      });
      expect(await role.exit).toBe(1);
      expect(await role.written()).toEqual([]);
      expect(role.errors.join("")).toMatch(/couldn't open: The lock engine\.lock is held/);
    });
  });

  describe("when it stops", () => {
    it("on stop: scheduler, 10 s grace, close, then stopped as the last frame", async () => {
      const { engine, log, listeners } = fakeEngine({ interrupted: 1 });
      const role = startRole(async () => engine);
      await role.written();
      role.input.write(shellFrame('{"kind":"stop"}'));
      expect(await role.exit).toBe(0);
      expect(log.steps).toEqual(["stopScheduling", "settle", "close"]);
      expect(log.graceMs).toEqual([10_000]);
      expect(await role.written()).toEqual([{ kind: "stopped", interrupted: 1 }]);
      expect(listeners.size).toBe(0);
      expect(role.ticks.size).toBe(0);
    });

    it("when standard input ends: the same steps, no stopped, exit 0", async () => {
      const { engine, log } = fakeEngine();
      const role = startRole(async () => engine);
      await role.written();
      role.input.end();
      expect(await role.exit).toBe(0);
      expect(log.steps).toEqual(["stopScheduling", "settle", "close"]);
      expect(await role.written()).toEqual([]);
    });

    it("when the pipe breaks: the same steps, exit 1, and the frame isn't quoted", async () => {
      const { engine, log } = fakeEngine();
      const role = startRole(async () => engine);
      await role.written();
      role.input.write(shellFrame('{"kind":"stop","canary":"canary-value"}'));
      expect(await role.exit).toBe(1);
      expect(log.steps).toEqual(["stopScheduling", "settle", "close"]);
      expect(await role.written()).toEqual([]);
      expect(role.errors.join("")).toMatch(/control pipe broke/);
      expect(role.errors.join("")).not.toContain("canary");
    });

    it("still closes the engine when the interrupted runs can't be recorded", async () => {
      const { engine, log } = fakeEngine({ settleFails: true });
      const role = startRole(async () => engine);
      await role.written();
      role.input.write(shellFrame('{"kind":"stop"}'));
      expect(await role.exit).toBe(1);
      expect(log.steps).toEqual(["stopScheduling", "settle", "close"]);
      expect(await role.written()).toEqual([{ kind: "stopped", interrupted: 0 }]);
      expect(role.errors.join("")).toMatch(/interrupted runs: The run store is read-only/);
    });
  });
});
