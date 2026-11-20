import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { finished, harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const agents = { writer: writerAgent("claude-code") };

const refusal = `Agent "writer" runs in claude-code, and this workspace isn't trusted on this computer, so Halonic didn't start it.`;

/** Runs the reply workflow's harness step with the check, and returns what it recorded. */
async function runWith(mayStartHarness?: () => Promise<boolean>) {
  const ports = harnessPorts();
  ports.harness.events = [finished("Dear support")];
  const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
    agents,
    harnesses: ports.options,
    ...(mayStartHarness === undefined ? {} : { mayStartHarness }),
  });
  await executor.start(replyStart);
  await scheduler.runDue();
  return { ports, run: await runs.get("run_1"), log: runs.logs.get("run_1") };
}

verifies("engine.harness-may-start", () => {
  it("starts no harness and fails the run when the check says no", async () => {
    let asked = 0;
    const { ports, run, log } = await runWith(async () => {
      asked += 1;
      return false;
    });

    expect(asked).toBe(1);
    expect(run).toMatchObject({ status: "failed", reason: "error", error: refusal });
    expect(log?.at(-1)).toMatchObject({
      type: "run.failed",
      error: refusal,
      cause: {
        kind: "denied",
        code: "engine.untrusted-workspace",
        detail: { agent: "writer", harness: "claude-code" },
      },
    });
    expect(typesOf(log)).not.toContain("sandbox.started");
    expect(typesOf(log)).not.toContain("harness.started");
    expect(ports.steps).toEqual([]);
    expect(ports.harness.tasks).toEqual([]);
  });

  it("starts no harness and fails the run the same way when the check rejects", async () => {
    const { ports, run, log } = await runWith(async () => {
      throw new Error("The trust record can't be read.");
    });

    expect(run).toMatchObject({ status: "failed", reason: "error", error: refusal });
    expect(log?.at(-1)).toMatchObject({
      type: "run.failed",
      cause: { kind: "denied", code: "engine.untrusted-workspace" },
    });
    expect(ports.steps).toEqual([]);
    expect(ports.harness.tasks).toEqual([]);
  });

  it("runs the harness step as before when the check says yes", async () => {
    const { run, log } = await runWith(async () => true);

    expect(run).toMatchObject({ status: "completed", context: { reply: "Dear support" } });
    expect(typesOf(log)).toContain("harness.started");
  });

  it("runs the harness step as before without a check", async () => {
    const { ports, run } = await runWith();

    expect(run).toMatchObject({ status: "completed", context: { reply: "Dear support" } });
    expect(ports.harness.tasks).toHaveLength(1);
  });

  it("doesn't hold the engine's close while the check hangs, and starts nothing after it", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const answer = Promise.withResolvers<boolean>();
    let asked = 0;
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
      mayStartHarness: () => {
        asked += 1;
        return answer.promise;
      },
    });

    await executor.start(replyStart);
    const harnessCall = scheduler.deliver("run_1", "harness:call-1");
    await waitUntil("the check was asked", () => asked === 1);
    await executor.close();
    await harnessCall;
    answer.resolve(true);
    await answer.promise;

    expect(ports.steps).toEqual([]);
    expect(ports.harness.tasks).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "running" });
  });
});
