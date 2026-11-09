import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { LiveRegions } from "../announcer/announcer.ts";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import type { EngineConnectionEvent } from "./engine-connection.ts";
import type { EngineLauncher, EngineProcessEvents } from "./engine-start.ts";

/** A launcher whose processes the test moves by hand. */
class FakeLauncher implements EngineLauncher {
  readonly processes: { events: EngineProcessEvents; stopped: boolean }[] = [];
  /** Runs inside `start`, before it returns, like a process that ends at once. */
  onStart: ((events: EngineProcessEvents) => void) | undefined;

  start(events: EngineProcessEvents) {
    const entry = { events, stopped: false };
    this.processes.push(entry);
    this.onStart?.(events);
    return {
      stop: () => {
        entry.stopped = true;
      },
    };
  }

  get latest(): EngineProcessEvents {
    const entry = this.processes.at(-1);
    if (entry === undefined) {
      throw new Error("No engine process was started.");
    }
    return entry.events;
  }
}

function setUp() {
  const timers = new FakeTimers();
  const shell = createShell({
    features: [defineFeature({ id: "runs", title: "Runs", register: () => {} })],
    timers,
  });
  const said: string[] = [];
  const regions: LiveRegions = {
    polite: { say: (text) => said.push(`polite:${text}`) },
    assertive: { say: (text) => said.push(`assertive:${text}`) },
  };
  shell.announcer.mountRegions(regions);
  const events: EngineConnectionEvent[] = [];
  shell.engine.on("engine.connection", (event) => events.push(event));
  return { timers, shell, said, events, launcher: new FakeLauncher() };
}

verifies("shell.engine-start", () => {
  it("reports the start before any time passes, then the answer", () => {
    const { timers, shell, said, events, launcher } = setUp();
    shell.engine.supervise(launcher);
    expect(events).toEqual([{ state: "starting", attempt: 1, since: 0 }]);
    timers.advance(1_200);
    launcher.latest.ready();
    timers.advance(0);
    expect(shell.engine.connection).toBe("connected");
    expect(events.at(-1)).toEqual({ state: "connected" });
    expect(said).toEqual([]);
    expect(timers.pending).toBe(0);
  });

  it("fails with no-answer after 30 s and stops the process", () => {
    const { timers, shell, events, launcher } = setUp();
    shell.engine.supervise(launcher);
    timers.advance(29_999);
    expect(shell.engine.connection).toBe("starting");
    timers.advance(1);
    expect(events.at(-1)).toEqual({ state: "failed", failure: { reason: "no-answer" } });
    expect(launcher.processes[0]?.stopped).toBe(true);
    launcher.latest.ready();
    expect(shell.engine.connection).toBe("failed");
  });

  it("fails with the exit code when the engine stops while starting", () => {
    const { shell, launcher } = setUp();
    shell.engine.supervise(launcher);
    launcher.latest.exited(3);
    expect(shell.engine.status).toEqual({
      state: "failed",
      failure: { reason: "stopped-while-starting", exitCode: 3 },
    });
    expect(launcher.processes).toHaveLength(1);
  });

  it("fails when the engine can't write its data folder, and ignores the exit that follows", () => {
    const { shell, events, launcher } = setUp();
    shell.engine.supervise(launcher);
    launcher.latest.dataFolderNotWritable();
    launcher.latest.exited(1);
    expect(events.slice(1)).toEqual([
      { state: "failed", failure: { reason: "data-folder-not-writable" } },
    ]);
    expect(launcher.processes[0]?.stopped).toBe(true);
  });

  it("stops a process that ends before start returns", () => {
    const { shell, launcher } = setUp();
    launcher.onStart = (events) => events.exited(null);
    shell.engine.supervise(launcher);
    expect(shell.engine.status).toEqual({
      state: "failed",
      failure: { reason: "stopped-while-starting", exitCode: null },
    });
    expect(launcher.processes[0]?.stopped).toBe(true);
  });

  it("restarts a stopped engine once, after 2 s", () => {
    const { timers, shell, said, events, launcher } = setUp();
    shell.engine.supervise(launcher);
    launcher.latest.ready();
    timers.advance(300_000);
    launcher.latest.exited(137);
    expect(shell.engine.connection).toBe("lost");
    timers.advance(1_999);
    expect(launcher.processes).toHaveLength(1);
    timers.advance(1);
    expect(events.at(-1)).toEqual({
      state: "starting",
      attempt: 2,
      since: 302_000,
      lastExitCode: 137,
    });
    launcher.latest.ready();
    timers.advance(0);
    expect(said).toEqual([
      "assertive:Lost the connection to the engine.",
      "polite:Connected to the engine again.",
    ]);
  });

  it("doesn't restart again when the engine stops within 60 s of its restart", () => {
    const { timers, shell, launcher } = setUp();
    shell.engine.supervise(launcher);
    launcher.latest.ready();
    launcher.latest.exited(1);
    timers.advance(2_000);
    launcher.latest.ready();
    timers.advance(59_999);
    launcher.latest.exited(2);
    expect(shell.engine.status).toEqual({
      state: "failed",
      failure: { reason: "stopped-while-starting", exitCode: 2 },
    });
    timers.advance(10_000);
    expect(launcher.processes).toHaveLength(2);
  });

  it("restarts again once the restarted engine has run for 60 s", () => {
    const { timers, shell, launcher } = setUp();
    shell.engine.supervise(launcher);
    launcher.latest.ready();
    launcher.latest.exited(1);
    timers.advance(2_000);
    launcher.latest.ready();
    timers.advance(60_000);
    launcher.latest.exited(1);
    timers.advance(2_000);
    expect(launcher.processes).toHaveLength(3);
    expect(shell.engine.status).toMatchObject({ state: "starting", attempt: 2 });
  });

  it("reports a restart that doesn't answer as no-answer", () => {
    const { timers, shell, launcher } = setUp();
    shell.engine.supervise(launcher);
    launcher.latest.ready();
    launcher.latest.exited(1);
    timers.advance(32_000);
    expect(shell.engine.status).toEqual({ state: "failed", failure: { reason: "no-answer" } });
  });

  it("starts from the first attempt again on retry", () => {
    const { timers, shell, launcher } = setUp();
    const supervisor = shell.engine.supervise(launcher);
    launcher.latest.exited(1);
    timers.advance(5_000);
    supervisor.retry();
    expect(shell.engine.status).toEqual({ state: "starting", attempt: 1, since: 5_000 });
    launcher.latest.ready();
    expect(shell.engine.connection).toBe("connected");
  });

  it("stops the engine and its timers, and frees the shell to follow another", () => {
    const { timers, shell, events, launcher } = setUp();
    const supervisor = shell.engine.supervise(launcher);
    expect(() => shell.engine.supervise(launcher)).toThrow(ShellError);
    expect(() => shell.engine.watch({})).toThrow(ShellError);
    launcher.latest.ready();
    launcher.latest.exited(1);
    supervisor.stop();
    timers.advance(60_000);
    expect(launcher.processes).toHaveLength(1);
    expect(events.at(-1)).toEqual({ state: "lost" });
    expect(() => supervisor.retry()).toThrow(ShellError);
    expect(() => shell.engine.watch({})).not.toThrow();
  });

  it("finishes a restart when a listener throws, then throws its error", () => {
    const { timers, shell, launcher } = setUp();
    shell.engine.supervise(launcher);
    launcher.latest.ready();
    shell.engine.on("engine.connection", () => {
      throw new Error("faulty feature");
    });
    shell.engine.on("engine.connection", () => {
      throw new Error("another faulty feature");
    });
    expect(() => launcher.latest.exited(1)).toThrow(AggregateError);
    expect(() => timers.advance(2_000)).toThrow(AggregateError);
    expect(launcher.processes).toHaveLength(2);
    expect(shell.engine.status).toMatchObject({ state: "starting", attempt: 2 });
  });

  it("stops the engine when a listener throws on the first state", () => {
    const { shell, launcher } = setUp();
    const stopListening = shell.engine.on("engine.connection", () => {
      throw new Error("faulty feature");
    });
    expect(() => shell.engine.supervise(launcher)).toThrow("faulty feature");
    expect(launcher.processes[0]?.stopped).toBe(true);
    stopListening();
    expect(() => shell.engine.supervise(launcher)).not.toThrow();
  });
});
