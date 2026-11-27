// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { createShell } from "../shell.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ShellEngineState } from "./engine-connection.ts";
import { EngineLine } from "./engine-line.tsx";

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

afterEach(unmountAll);

verifies("shell.engine-starting", () => {
  it("is starting until the engine's open settles, then connected, and announces neither", async () => {
    const { shell, events } = setUp();
    const open = handSettled();

    shell.engine.startingUntil(open.promise);
    expect(shell.engine.connection).toBe("starting");
    expect(shell.engine.stale).toBe(false);

    open.resolve();
    await open.promise;
    expect(shell.engine.connection).toBe("connected");
    expect(events).toEqual(["starting", "connected"]);
  });

  it("is connected again when the engine's open fails, as the window then runs its own", async () => {
    const { shell } = setUp();
    const open = handSettled();
    shell.engine.startingUntil(open.promise);

    open.reject(new Error("The engine didn't start."));
    await open.promise.catch(() => undefined);

    expect(shell.engine.connection).toBe("connected");
  });

  it("keeps starting while a newer open still waits", async () => {
    const { shell } = setUp();
    const first = handSettled();
    const second = handSettled();
    shell.engine.startingUntil(first.promise);
    shell.engine.startingUntil(second.promise);

    first.resolve();
    await first.promise;
    expect(shell.engine.connection).toBe("starting");

    second.resolve();
    await second.promise;
    expect(shell.engine.connection).toBe("connected");
  });

  it("changes nothing while the shell follows an executor", () => {
    const { shell } = setUp();
    shell.engine.watch({});

    shell.engine.startingUntil(new Promise(() => {}));

    expect(shell.engine.connection).toBe("connected");
  });

  it('shows the line "Starting the engine…" while the engine starts, and drops it once it answers', async () => {
    const { shell } = setUp();
    const open = handSettled();
    const container = render(<EngineLine engine={shell.engine} />);
    expect(container.textContent).toBe("");

    act(() => shell.engine.startingUntil(open.promise));
    expect(container.textContent).toBe("Starting the engine…");

    await act(async () => {
      open.resolve();
      await open.promise;
    });
    expect(container.textContent).toBe("");
  });
});
