import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

// An agent a person set to run on this computer whose file changed since runs
// in its sandbox. When that sandbox can't start, `run.failed` says the choice
// is on hold, so Studio can ask the person to confirm it again instead of
// sending them to fix the sandbox.

const agents = { writer: writerAgent("claude-code") };

/** Harness ports whose sandbox check fails, so the agent is refused. */
function refusingPorts() {
  const ports = harnessPorts();
  ports.sandbox.check = async () => ({
    ok: false,
    reason: "user-namespaces-restricted",
    missing: ["unprivileged user namespaces are restricted"],
  });
  return ports;
}

/** Starts the reply run, lets its harness call run, and gives back the run's last event. */
async function lastEventOf(ports: ReturnType<typeof harnessPorts>): Promise<unknown> {
  const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
    agents,
    harnesses: ports.options,
  });
  await executor.start(replyStart);
  await scheduler.runDue();
  return runs.logs.get("run_1")?.at(-1);
}

verifies("engine.run-harness-failures", () => {
  it("says the refused agent's this-computer choice is on hold when its file changed", async () => {
    const ports = refusingPorts();
    ports.holdThisComputer();

    expect(await lastEventOf(ports)).toEqual(
      expect.objectContaining({
        type: "run.failed",
        reason: "sandbox-not-ready",
        sandboxReason: "user-namespaces-restricted",
        agent: "writer",
        onHold: true,
      }),
    );
    expect(ports.steps).toEqual([]);
  });

  it("says nothing of a hold for an agent nobody set to this computer", async () => {
    const ports = refusingPorts();

    const failed = await lastEventOf(ports);

    expect(failed).toMatchObject({ type: "run.failed", reason: "sandbox-not-ready" });
    expect(failed).not.toHaveProperty("onHold");
  });
});
