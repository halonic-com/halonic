import type { LoggedSandboxBlock, RunEventBody, SandboxBlock } from "@halonicjs/events";
import { StopSource } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { BlockedAccesses } from "./blocked-accesses.ts";
import { finished, harnessPorts, startLimits } from "./harness-test-kit.test-helper.ts";
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
  agent: writerAgent("claude-code"),
};

const sshKey: SandboxBlock = { kind: "file", path: "<home>/.ssh/id_ed25519", access: "read" };
const site: SandboxBlock = { kind: "network", host: "api.example.com", port: 443 };

/** A log that keeps what it is given, in order. */
function keepingLog() {
  const written: RunEventBody[] = [];
  const log: HarnessEventLog = {
    append: async (event) => {
      written.push(event);
    },
    settled: async () => {},
  };
  return { log, written };
}

/** Runs the call on the ports, and gives back the `sandbox.blocked` events it wrote. */
async function blockedEventsOf(ports: ReturnType<typeof harnessPorts>, stop = new StopSource()) {
  const { log, written } = keepingLog();
  let error: unknown;
  try {
    await runHarnessCall(ports.options, call, log, startLimits().limits, stop.signal);
  } catch (thrown) {
    error = thrown;
  }
  return { error, blocked: written.filter((event) => event.type === "sandbox.blocked") };
}

/** The `sandbox.blocked` event the `writer` step logs for `block` with `count`. */
function blockedEvent(block: LoggedSandboxBlock, count: number) {
  return { type: "sandbox.blocked", state: "draft", agent: "writer", block, count };
}

verifies("engine.sandbox-blocked", () => {
  it("writes a target's first block at once, and the total of the ones refused again when the step ends", async () => {
    const ports = harnessPorts();
    ports.harness.whileRunning = () => {
      ports.sandbox.block(sshKey);
      ports.sandbox.block(site);
      ports.sandbox.block(sshKey);
      ports.sandbox.block(sshKey);
    };
    ports.harness.events = [finished("ok")];

    const { blocked } = await blockedEventsOf(ports);

    const sshKeyView = { kind: "file", path: "~/.ssh/id_ed25519", access: "read" } as const;
    expect(blocked).toEqual([
      blockedEvent(sshKeyView, 1),
      blockedEvent(site, 1),
      blockedEvent(sshKeyView, 3),
    ]);
  });

  it("counts a read and a write of the same file as two targets", async () => {
    const ports = harnessPorts();
    ports.harness.whileRunning = () => {
      ports.sandbox.block({ kind: "file", path: "/etc/hosts", access: "read" });
      ports.sandbox.block({ kind: "file", path: "/etc/hosts", access: "write" });
    };
    ports.harness.events = [finished("ok")];

    const { blocked } = await blockedEventsOf(ports);

    expect(blocked.map((event) => event.count)).toEqual([1, 1]);
  });

  it("counts the targets past the first 100 together as others", async () => {
    const ports = harnessPorts();
    ports.harness.whileRunning = () => {
      for (let file = 1; file <= 102; file += 1) {
        ports.sandbox.block({ kind: "file", path: `/data/${file}.txt`, access: "read" });
      }
    };
    ports.harness.events = [finished("ok")];

    const { blocked } = await blockedEventsOf(ports);

    expect(blocked).toHaveLength(102);
    expect(blocked[99]).toMatchObject({ block: { path: "/data/100.txt" }, count: 1 });
    expect(blocked.slice(100)).toEqual([
      blockedEvent({ kind: "others" }, 1),
      blockedEvent({ kind: "others" }, 2),
    ]);
  });

  it("writes the totals when the step fails too, and stops hearing the session", async () => {
    const ports = harnessPorts();
    ports.harness.whileRunning = () => {
      ports.sandbox.block(site);
      ports.sandbox.block(site);
    };
    ports.harness.events = [{ type: "tool.called", agent: "writer", tool: "Read", args: {} }];
    ports.harness.error = new Error("The program crashed.");

    const { error, blocked } = await blockedEventsOf(ports);

    expect(String(error)).toContain("The program crashed.");
    expect(blocked.map((event) => event.count)).toEqual([1, 2]);
    expect(ports.sandbox.listening).toBe(0);
  });

  it("writes no totals when the engine stops the call", async () => {
    const ports = harnessPorts();
    const stop = new StopSource();
    ports.harness.whileRunning = () => {
      ports.sandbox.block(sshKey);
      ports.sandbox.block(sshKey);
      stop.stop(new Error("The engine stopped."));
    };
    ports.harness.hangs = true;

    const { error, blocked } = await blockedEventsOf(ports, stop);

    expect(String(error)).toContain("The engine stopped.");
    expect(blocked.map((event) => event.count)).toEqual([1]);
  });

  it("fails the totals with the error of a first block that couldn't be written", async () => {
    const accesses = new BlockedAccesses(
      {
        append: async () => {
          throw new Error("The disk is full.");
        },
        settled: async () => {},
      },
      { state: "draft", agent: "writer" },
      null,
    );

    accesses.note(site);

    await expect(accesses.writeTotals()).rejects.toThrow("The disk is full.");
  });
});
