// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { createShell } from "../shell.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWorkspace } from "../window/studio-workspace.ts";
import type { ShellEngineState } from "./engine-connection.ts";
import { EngineLine } from "./engine-line.tsx";
import { EngineStarting } from "./engine-starting.ts";

/** A promise the test settles by hand, like the shell's answer to `engine_open`. */
function handSettled() {
  let resolve = (): void => {};
  let reject = (_error: unknown): void => {};
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve: () => resolve(), reject: (error: unknown) => reject(error) };
}

function setUp() {
  const shell = createShell({ features: [], timers: new FakeTimers(), host: "desktop-app" });
  const events: ShellEngineState[] = [];
  shell.engine.on("engine.connection", (event) => events.push(event.state));
  return { shell, events };
}

function workspaceOf(shell: ReturnType<typeof setUp>["shell"], engineReady?: Promise<unknown>) {
  return new StudioWorkspace({ toasts: shell.toasts, services: new MapTarget(), engineReady });
}

afterEach(unmountAll);

verifies("shell.engine-starting", () => {
  it("is starting until the workspace's engine open settles, and announces nothing", async () => {
    const { shell, events } = setUp();
    const open = handSettled();
    const workspace = workspaceOf(shell, open.promise);
    expect(workspace.engineStarting.starting).toBe(true);

    open.resolve();
    await open.promise;

    expect(workspace.engineStarting.starting).toBe(false);
    expect(events).toEqual([]);
  });

  it("has started when the engine's open fails, as the window then runs its own", async () => {
    const open = handSettled();
    const starting = new EngineStarting(open.promise);

    open.reject(new Error("The engine didn't start."));
    await open.promise.catch(() => undefined);

    expect(starting.starting).toBe(false);
  });

  it("isn't starting for a workspace opened without an engine open", () => {
    const { shell } = setUp();
    expect(workspaceOf(shell).engineStarting.starting).toBe(false);
  });

  it("keeps the window's engine connected while a second workspace's engine starts", () => {
    const { shell, events } = setUp();
    shell.engine.watch({});
    workspaceOf(shell, Promise.resolve());

    workspaceOf(shell, new Promise(() => {}));

    expect(shell.engine.connection).toBe("connected");
    expect(shell.engine.stale).toBe(false);
    expect(events).toEqual([]);
  });

  it('shows "Starting the engine…" for the shown workspace only, and drops it once it answers', async () => {
    const { shell } = setUp();
    const open = handSettled();
    const globex = workspaceOf(shell, open.promise);
    const acme = workspaceOf(shell);

    const acmeLine = render(<EngineLine engine={shell.engine} starting={acme.engineStarting} />);
    expect(acmeLine.textContent).toBe("");
    const line = render(<EngineLine engine={shell.engine} starting={globex.engineStarting} />);
    expect(line.textContent).toBe("Starting the engine…");

    await act(async () => {
      open.resolve();
      await open.promise;
    });
    expect(line.textContent).toBe("");
  });
});
