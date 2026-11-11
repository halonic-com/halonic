import type { RunEventBody } from "@halonicjs/events";
import { isRunFailureError } from "@halonicjs/ports";
import { StopSource } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { SandboxNotReadyError } from "../run/sandbox-not-ready-error.ts";
import {
  finished,
  harnessPorts,
  noApprovals,
  startLimits,
  stillOpen,
} from "./harness-test-kit.test-helper.ts";
import { type HarnessCall, type HarnessEventLog, runHarnessCall } from "./run-harness-call.ts";

const call: HarnessCall = {
  effect: {
    callId: "call-1",
    state: "draft",
    agent: "writer",
    harness: "claude-code",
    prompt: "Reply to support",
  },
  runId: "run_1",
  hubId: "acme",
  agent: { ...writerAgent("claude-code"), instructions: "Write short mails.", model: "sonnet" },
  filesFolder: null,
};

/** A signal no one tells to stop, for calls the engine doesn't stop. */
const goingOn = new StopSource().signal;

/** A log that stores nothing, except where `append` says. */
function logOf(append: (event: RunEventBody) => Promise<void>): HarnessEventLog {
  return { append, settled: async () => {}, whileHeld: (work) => work() };
}

/** Runs the call on the ports, and keeps what it wrote to the log. */
async function runOn(
  ports: ReturnType<typeof harnessPorts>,
  limits = startLimits().limits,
  stop = goingOn,
  approvals = noApprovals,
) {
  const written: RunEventBody[] = [];
  const log = logOf(async (event) => {
    written.push(event);
  });
  try {
    const output = await runHarnessCall(ports.options, call, log, approvals, limits, stop);
    return { output, written };
  } catch (error) {
    return { error, written };
  }
}

verifies("engine.run-harness", () => {
  it("opens the bridge and the sandbox, starts the harness and gives back the agent's result", async () => {
    const ports = harnessPorts();
    ports.harness.events = [
      { type: "tool.called", agent: "writer", tool: "Read", args: { path: "notes.md" } },
      { type: "agent.started", agent: "checker", prompt: "Check it", parent: "writer" },
      finished("On its way"),
    ];

    const { output, written } = await runOn(ports);

    expect(output).toBe("On its way");
    expect(written.map((event) => event.type)).toEqual([
      "sandbox.started",
      "sandbox.opened",
      "harness.started",
      "tool.called",
      "agent.started",
    ]);
    expect(written[0]).toEqual({
      type: "sandbox.started",
      state: "draft",
      agent: "writer",
      timeoutMs: 30_000,
    });
    expect(written[1]).toMatchObject({
      type: "sandbox.opened",
      sandbox: { strength: "os", deniedGroups: ["ssh-keys"], deniedPaths: [] },
    });
    expect(written[2]).toEqual({
      type: "harness.started",
      state: "draft",
      agent: "writer",
      harness: "claude-code",
      timeoutMs: 60_000,
    });
    expect(written[4]).toMatchObject({ type: "agent.started", state: "draft", parent: "writer" });
    expect(ports.harness.tasks).toEqual([
      {
        runId: "run_1",
        hubId: "acme",
        agentId: "writer",
        instructions: "Write short mails.",
        prompt: "Reply to support",
        model: "sonnet",
      },
    ]);
  });

  it("gives the program the profile's variables and the harness's own, and no others", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];

    await runOn(ports);

    expect(ports.sandbox.profiles[0]?.env).toEqual({
      PATH: "/usr/bin",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:41817",
    });
  });

  it("writes what the bridge records to the same log", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    const { written } = await runOn(ports);

    await ports.recorders[0]?.record({
      type: "llm.request",
      agent: "writer",
      provider: "anthropic",
      model: "sonnet",
      messages: 1,
    });

    expect(written.at(-1)).toMatchObject({ type: "llm.request", provider: "anthropic" });
  });

  it("stops the harness, closes the sandbox, then closes the bridge", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];

    await runOn(ports);

    expect(ports.steps).toEqual([
      "bridge.open",
      "sandbox.open",
      "harness.start",
      "harness.cancel",
      "session.close",
      "bridge.close",
    ]);
  });

  it("ends the harness's event stream after its result, so the harness's own clean-up runs", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];

    await runOn(ports);

    expect(ports.harness.streamsCleanedUp).toBe(1);
  });

  it("returns only once the log has stored every event, after the bridge is closed", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    const order: string[] = [];
    const log: HarnessEventLog = {
      append: async () => {},
      settled: async () => {
        order.push(`log.settled after ${ports.steps.at(-1)}`);
      },
      whileHeld: (work) => work(),
    };

    await runHarnessCall(ports.options, call, log, noApprovals, startLimits().limits, goingOn);

    expect(order).toEqual(["log.settled after bridge.close"]);
  });

  it("runs on this computer through the launcher's session when a person chose that", async () => {
    const ports = harnessPorts();
    ports.placeOnThisComputer("2026-11-09T10:00:00.000Z");
    ports.harness.events = [finished("ok")];

    const { output, written } = await runOn(ports);

    expect(output).toBe("ok");
    expect(ports.steps).toContain("this-computer.open");
    expect(ports.steps).not.toContain("sandbox.open");
    expect(written.map((event) => event.type)).toEqual([
      "sandbox.started",
      "sandbox.off",
      "harness.started",
    ]);
    expect(written[1]).toEqual({
      type: "sandbox.off",
      state: "draft",
      agent: "writer",
      chosenAt: "2026-11-09T10:00:00.000Z",
    });
  });

  it("closes the launcher's session when sandbox.off can't be written", async () => {
    const ports = harnessPorts();
    ports.placeOnThisComputer();
    const log = logOf(async (event) => {
      if (event.type === "sandbox.off") throw new Error("The disk is full.");
    });

    await expect(
      runHarnessCall(ports.options, call, log, noApprovals, startLimits().limits, goingOn),
    ).rejects.toThrow("The disk is full.");
    expect(ports.steps).toEqual([
      "bridge.open",
      "this-computer.open",
      "session.close",
      "bridge.close",
    ]);
  });

  it("starts nothing when the sandbox isn't ready, and never runs without it", async () => {
    const ports = harnessPorts();
    ports.sandbox.check = async () => ({
      ok: false,
      reason: "bubblewrap-missing",
      missing: ["bubblewrap is not installed"],
    });

    const { error, written } = await runOn(ports);

    expect(error).toBeInstanceOf(SandboxNotReadyError);
    expect(error).toMatchObject({ sandboxReason: "bubblewrap-missing" });
    expect(written).toEqual([]);
    expect(ports.steps).toEqual([]);
  });
});

verifies("engine.run-harness-failures", () => {
  it("fails with sandbox-start-failed when the sandbox doesn't open, and closes the bridge", async () => {
    const ports = harnessPorts();
    ports.sandbox.openError = new Error("bwrap: setting up uid map: Permission denied");

    const { error, written } = await runOn(ports);

    expect(isRunFailureError(error) && error.failure).toBe("sandbox-start-failed");
    expect(written.map((event) => event.type)).toEqual(["sandbox.started"]);
    expect(ports.steps).toEqual(["bridge.open", "bridge.close"]);
  });

  it("closes the sandbox when sandbox.opened can't be written", async () => {
    const ports = harnessPorts();
    const log = logOf(async (event) => {
      if (event.type === "sandbox.opened") throw new Error("The disk is full.");
    });

    await expect(
      runHarnessCall(ports.options, call, log, noApprovals, startLimits().limits, goingOn),
    ).rejects.toThrow("The disk is full.");
    expect(ports.steps).toEqual(["bridge.open", "sandbox.open", "session.close", "bridge.close"]);
  });

  it("fails with harness-start-failed when the program fails before its first event", async () => {
    const ports = harnessPorts();
    ports.harness.error = new Error("claude: command not found");

    const { error } = await runOn(ports);

    expect(isRunFailureError(error) && error.failure).toBe("harness-start-failed");
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
  });

  it("passes on a failure after the first event as it is", async () => {
    const ports = harnessPorts();
    ports.harness.events = [{ type: "tool.called", agent: "writer", tool: "Read", args: {} }];
    ports.harness.error = new Error("The program stopped.");

    const { error } = await runOn(ports);

    expect(isRunFailureError(error)).toBe(false);
    expect(String(error)).toContain("The program stopped.");
  });

  it("fails with harness-start-failed when the host offers no such harness", async () => {
    const ports = harnessPorts();
    const { error } = await runOn({
      ...ports,
      options: { ...ports.options, harnesses: {} },
    });

    expect(isRunFailureError(error) && error.failure).toBe("harness-start-failed");
    expect(ports.steps).toEqual([]);
  });

  it("fails when the stream ends without the agent's result", async () => {
    const ports = harnessPorts();
    ports.harness.events = [{ type: "tool.called", agent: "writer", tool: "Read", args: {} }];

    const { error } = await runOn(ports);

    expect(String(error)).toContain("ended without the agent's result");
  });
});

verifies("engine.harness-start-limits", () => {
  it("fails with sandbox-start-failed when the sandbox doesn't open in time, and closes it when it does", async () => {
    const ports = harnessPorts();
    const held = Promise.withResolvers<void>();
    ports.sandbox.openHeld = held.promise;
    const start = startLimits();

    const result = runOn(ports, start.limits);
    await start.timeUp("sandbox");
    const { error, written } = await result;

    expect(isRunFailureError(error) && error.failure).toBe("sandbox-start-failed");
    expect(String((error as Error).cause)).toContain("didn't open within 30 s");
    expect(written.map((event) => event.type)).toEqual(["sandbox.started"]);
    expect(ports.steps).toEqual(["bridge.open", "bridge.close"]);

    held.resolve();
    await vi.waitFor(() => expect(ports.steps).toContain("session.close"));
    expect(ports.steps).toEqual(["bridge.open", "bridge.close", "sandbox.open", "session.close"]);
  });

  it("fails with harness-start-failed when the harness sends nothing in time, and stops everything", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const start = startLimits();

    const result = runOn(ports, start.limits);
    await start.timeUp("harness");
    const { error, written } = await result;

    expect(isRunFailureError(error) && error.failure).toBe("harness-start-failed");
    expect(String((error as Error).cause)).toContain("sent nothing within 60 s");
    expect(written.at(-1)?.type).toBe("harness.started");
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
  });

  it("sets a timer for each start's limit, and removes it once the start is done", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    const start = startLimits();

    const result = runOn(ports, start.limits);
    const sandboxTimer = await start.scheduler.waitFor("run_1", "start:sandbox:call-1");
    const harnessTimer = await start.scheduler.waitFor("run_1", "start:harness:call-1");
    await result;

    expect(Date.parse(harnessTimer.at) - Date.parse(sandboxTimer.at)).toBeGreaterThanOrEqual(
      30_000,
    );
    expect(start.scheduler.timers.size).toBe(0);
  });

  it("takes each limit from the host's options when it sets one", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];

    const { written } = await runOn({
      ...ports,
      options: { ...ports.options, startTimeoutsMs: { sandbox: 5_000, harness: 90_000 } },
    });

    expect(written.find((event) => event.type === "sandbox.started")).toMatchObject({
      timeoutMs: 5_000,
    });
    expect(written.find((event) => event.type === "harness.started")).toMatchObject({
      timeoutMs: 90_000,
    });
  });

  it("changes nothing when a limit's timer arrives after its start is done", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("ok")];
    const start = startLimits();

    const { output } = await runOn(ports, start.limits);
    await start.timeUp("sandbox");
    await start.timeUp("harness");

    expect(output).toBe("ok");
    expect(ports.steps.filter((step) => step === "session.close")).toHaveLength(1);
  });
});

verifies("engine.harness-stops-with-engine", () => {
  it("stops the harness, closes the sandbox, then closes the bridge when stopped while the harness runs", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const stop = new StopSource();
    const start = startLimits();

    const result = runOn(ports, start.limits, stop.signal);
    await start.scheduler.waitFor("run_1", "start:harness:call-1");
    stop.stop(new Error("The engine stopped."));
    const { error } = await result;

    expect(String(error)).toContain("The engine stopped.");
    expect(isRunFailureError(error)).toBe(false);
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("stops while the harness reports events, without waiting for its next one", async () => {
    const ports = harnessPorts();
    ports.harness.events = [{ type: "tool.called", agent: "writer", tool: "Read", args: {} }];
    ports.harness.hangs = true;
    const stop = new StopSource();
    const start = startLimits();

    const result = runOn(ports, start.limits, stop.signal);
    // The first event is in once its start limit's timer is gone.
    await start.scheduler.waitFor("run_1", "start:harness:call-1");
    await vi.waitFor(() => expect(start.scheduler.timers.size).toBe(0));
    stop.stop(new Error("The engine stopped."));
    const { error, written } = await result;

    expect(String(error)).toContain("The engine stopped.");
    expect(written.at(-1)).toMatchObject({ type: "tool.called" });
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("closes a sandbox that opens after the call was stopped", async () => {
    const ports = harnessPorts();
    const held = Promise.withResolvers<void>();
    ports.sandbox.openHeld = held.promise;
    const stop = new StopSource();
    const start = startLimits();

    const result = runOn(ports, start.limits, stop.signal);
    await start.scheduler.waitFor("run_1", "start:sandbox:call-1");
    stop.stop(new Error("The engine stopped."));
    const { error } = await result;

    expect(String(error)).toContain("The engine stopped.");
    expect(ports.steps).toEqual(["bridge.open", "bridge.close"]);
    held.resolve();
    await vi.waitFor(() => expect(ports.steps).toContain("session.close"));
    expect(stillOpen(ports.steps)).toBe(0);
  });
});
