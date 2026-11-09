import type { EngineConnection, EngineConnectionState } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { LiveRegions } from "../announcer/announcer.ts";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import type { ShellEngineState } from "./engine-connection.ts";

/** An executor connection the test moves by hand, like a remote executor's. */
class FakeConnection implements EngineConnection {
  state: EngineConnectionState;
  private readonly listeners = new Set<(state: EngineConnectionState) => void>();

  constructor(state: EngineConnectionState = "connected") {
    this.state = state;
  }

  onChange(listener: (state: EngineConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(state: EngineConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  get listening(): number {
    return this.listeners.size;
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
  const events: ShellEngineState[] = [];
  shell.engine.on("engine.connection", (event) => events.push(event.state));
  return { timers, shell, said, events };
}

verifies("shell.engine-connection", () => {
  it("sends and announces each change of the executor's connection once", () => {
    const { timers, shell, said, events } = setUp();
    const connection = new FakeConnection();
    shell.engine.watch({ connection });
    expect(shell.engine.connection).toBe("connected");
    connection.set("lost");
    connection.set("lost");
    timers.advance(0);
    expect(shell.engine.connection).toBe("lost");
    connection.set("connected");
    timers.advance(0);
    expect(events).toEqual(["lost", "connected"]);
    expect(said).toEqual([
      "assertive:Lost the connection to the engine.",
      "polite:Connected to the engine again.",
    ]);
  });

  it("starts from the executor's state when it is already lost", () => {
    const { timers, shell, said, events } = setUp();
    shell.engine.watch({ connection: new FakeConnection("lost") });
    timers.advance(0);
    expect(events).toEqual(["lost"]);
    expect(said).toEqual(["assertive:Lost the connection to the engine."]);
  });

  it("counts an executor without a connection as always connected", () => {
    const { timers, shell, said, events } = setUp();
    shell.engine.watch({});
    timers.advance(0);
    expect(shell.engine.connection).toBe("connected");
    expect(events).toEqual([]);
    expect(said).toEqual([]);
  });

  it("stops following when asked, and then follows another executor", () => {
    const { shell, events } = setUp();
    const first = new FakeConnection();
    const stop = shell.engine.watch({ connection: first });
    expect(() => shell.engine.watch({ connection: new FakeConnection() })).toThrow(ShellError);
    stop();
    stop();
    expect(first.listening).toBe(0);
    first.set("lost");
    const second = new FakeConnection();
    shell.engine.watch({ connection: second });
    second.set("lost");
    expect(events).toEqual(["lost"]);
  });

  it("lets a listener stop listening", () => {
    const { shell } = setUp();
    const connection = new FakeConnection();
    shell.engine.watch({ connection });
    const heard: ShellEngineState[] = [];
    const stop = shell.engine.on("engine.connection", (event) => heard.push(event.state));
    connection.set("lost");
    stop();
    connection.set("connected");
    expect(heard).toEqual(["lost"]);
  });

  it("runs every listener when one throws, then throws its error", () => {
    const { shell, events } = setUp();
    const connection = new FakeConnection();
    shell.engine.watch({ connection });
    shell.engine.on("engine.connection", () => {
      throw new Error("faulty feature");
    });
    const heard: ShellEngineState[] = [];
    shell.engine.on("engine.connection", (event) => heard.push(event.state));
    expect(() => connection.set("lost")).toThrow("faulty feature");
    expect(events).toEqual(["lost"]);
    expect(heard).toEqual(["lost"]);
    shell.engine.on("engine.connection", () => {
      throw new Error("another faulty feature");
    });
    expect(() => connection.set("connected")).toThrow(AggregateError);
    expect(shell.engine.connection).toBe("connected");
  });

  it("undoes the watch when a listener throws on the first state", () => {
    const { shell } = setUp();
    shell.engine.on("engine.connection", () => {
      throw new Error("faulty feature");
    });
    const lost = new FakeConnection("lost");
    expect(() => shell.engine.watch({ connection: lost })).toThrow("faulty feature");
    expect(lost.listening).toBe(0);
    expect(shell.engine.connection).toBe("lost");
    const next = new FakeConnection("lost");
    expect(() => shell.engine.watch({ connection: next })).not.toThrow(ShellError);
  });
});
