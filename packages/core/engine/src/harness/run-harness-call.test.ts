import type { RunEventBody } from "@halonicjs/events";
import { isRunFailureError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { finished, harnessPorts } from "./harness-test-kit.test-helper.ts";
import { type HarnessCall, runHarnessCall } from "./run-harness-call.ts";

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
};

/** Runs the call on the ports, and keeps what it wrote to the log. */
async function runOn(ports: ReturnType<typeof harnessPorts>) {
  const written: RunEventBody[] = [];
  const log = {
    append: async (event: RunEventBody) => {
      written.push(event);
    },
  };
  try {
    return { output: await runHarnessCall(ports.options, call, log), written };
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

  it("runs on this computer through the launcher's session when a person chose that", async () => {
    const ports = harnessPorts();
    ports.placeOnThisComputer();
    ports.harness.events = [finished("ok")];

    const { output } = await runOn(ports);

    expect(output).toBe("ok");
    expect(ports.steps).toContain("this-computer.open");
    expect(ports.steps).not.toContain("sandbox.open");
  });

  it("starts nothing when the sandbox isn't ready, and never runs without it", async () => {
    const ports = harnessPorts();
    ports.sandbox.check = async () => ({
      ok: false,
      reason: "bubblewrap-missing",
      missing: ["bubblewrap is not installed"],
    });

    const { error, written } = await runOn(ports);

    expect(String(error)).toContain("bubblewrap-missing");
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
    const log = {
      append: async (event: RunEventBody) => {
        if (event.type === "sandbox.opened") throw new Error("The disk is full.");
      },
    };

    await expect(runHarnessCall(ports.options, call, log)).rejects.toThrow("The disk is full.");
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

  describe("until runs can wait on a harness", () => {
    it("fails on an approval request and stops everything", async () => {
      const ports = harnessPorts();
      ports.harness.events = [
        { type: "approval.requested", agent: "writer", callId: "c1", tool: "Bash", args: {} },
      ];

      const { error, written } = await runOn(ports);

      expect(String(error)).toContain("can't wait for one yet");
      expect(written.map((event) => event.type)).not.toContain("approval.requested");
      expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    });
  });

  it("fails when the stream ends without the agent's result", async () => {
    const ports = harnessPorts();
    ports.harness.events = [{ type: "tool.called", agent: "writer", tool: "Read", args: {} }];

    const { error } = await runOn(ports);

    expect(String(error)).toContain("ended without the agent's result");
  });
});
