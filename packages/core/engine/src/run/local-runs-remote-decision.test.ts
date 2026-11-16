import type { HarnessEvent } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { finished, harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { KernelBlobs, KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

// The fake harness stands in for any adapter that reports approvals as events, such as Codex: the engine path is the same.
const agents = { writer: writerAgent("claude-code") };

/** The harness asks to run `rm -r drafts`, under its own call id. */
const asks = (callId: string): HarnessEvent => ({
  type: "approval.requested",
  agent: "writer",
  callId,
  tool: "Bash",
  args: { command: "rm -r drafts" },
});

/** Starts the run and its harness call, and resolves once the run waits for an approval. */
async function waitingRun(ports: ReturnType<typeof harnessPorts>) {
  const runs = new KernelRuns();
  const setup = runsOn([], runs, { agents, harnesses: ports.options, blobs: new KernelBlobs() });
  await setup.executor.start(replyStart);
  const harnessCall = setup.scheduler.deliver("run_1", "harness:call-1");
  await vi.waitFor(async () =>
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" }),
  );
  return { ...setup, harnessCall };
}

/** The `by` of every `approval.resolved` the run recorded. */
function resolvers(runs: KernelRuns): unknown[] {
  return (runs.logs.get("run_1") ?? [])
    .filter(({ type }) => type === "approval.resolved")
    .map((event) => (event as { by?: unknown }).by);
}

verifies("engine.remote-decision", () => {
  it("lets a remote device allow, as the card click does, and logs the device", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Done")];
    const { executor, runs, harnessCall } = await waitingRun(ports);

    await executor.send("run_1", "approve", undefined, { callId: "call-2", by: "remote-device" });
    await harnessCall;

    expect(ports.harness.sent).toEqual([{ type: "approval", callId: "toolu_7", approved: true }]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(resolvers(runs)).toEqual(["remote-device"]);
  });

  it("lets a remote device deny, and the harness hears the refusal", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Left the drafts alone")];
    const { executor, runs, harnessCall } = await waitingRun(ports);

    await executor.send(
      "run_1",
      "reject",
      { comment: "Not now" },
      {
        callId: "call-2",
        by: "remote-device",
      },
    );
    await harnessCall;

    expect(ports.harness.sent).toEqual([
      { type: "approval", callId: "toolu_7", approved: false, comment: "Not now" },
    ]);
    expect(resolvers(runs)).toEqual(["remote-device"]);
  });

  it("logs a card click as a person", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Done")];
    const { executor, runs, harnessCall } = await waitingRun(ports);

    await executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await harnessCall;

    expect(resolvers(runs)).toEqual(["person"]);
  });

  it("takes one of a card click and a remote decision at once, and refuses the other", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Done")];
    const { executor, runs, harnessCall } = await waitingRun(ports);

    const answers = await Promise.allSettled([
      executor.send("run_1", "approve", undefined, { callId: "call-2" }),
      executor.send("run_1", "reject", undefined, { callId: "call-2", by: "remote-device" }),
    ]);
    await harnessCall;

    expect(answers.map(({ status }) => status)).toEqual(["fulfilled", "rejected"]);
    expect(answers[1]).toMatchObject({
      reason: { code: "engine.decision-callid-must-match" },
    });
    expect(ports.harness.sent).toEqual([{ type: "approval", callId: "toolu_7", approved: true }]);
    expect(resolvers(runs)).toEqual(["person"]);
  });

  it("refuses a remote decision for a call that was answered, while the next one waits", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_1"), asks("toolu_2"), finished("Done")];
    const { executor, runs } = await waitingRun(ports);
    await executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await vi.waitFor(async () =>
      expect(await runs.get("run_1")).toMatchObject({ approvals: [{ callId: "call-4" }] }),
    );
    const logged = runs.logs.get("run_1")?.length;

    const late = executor.send("run_1", "approve", undefined, {
      callId: "call-2",
      by: "remote-device",
    });

    await expect(late).rejects.toMatchObject({ code: "engine.decision-callid-must-match" });
    expect(ports.harness.sent).toEqual([{ type: "approval", callId: "toolu_1", approved: true }]);
    expect(runs.logs.get("run_1")).toHaveLength(logged ?? -1);
  });

  it("refuses a remote decision after the run ended, and tells the harness nothing", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Done")];
    const { executor, runs, harnessCall } = await waitingRun(ports);
    await executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await harnessCall;
    const logged = runs.logs.get("run_1")?.length;

    const late = executor.send("run_1", "reject", undefined, {
      callId: "call-2",
      by: "remote-device",
    });

    await expect(late).rejects.toMatchObject({ code: "engine.run-ended" });
    expect(ports.harness.sent).toHaveLength(1);
    expect(runs.logs.get("run_1")).toHaveLength(logged ?? -1);
  });

  it("refuses a remote decision for an id the run never gave, as the harness's own", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Done")];
    const { executor, runs } = await waitingRun(ports);
    const logged = runs.logs.get("run_1")?.length;

    const stale = executor.send("run_1", "approve", undefined, {
      callId: "toolu_7",
      by: "remote-device",
    });

    await expect(stale).rejects.toMatchObject({ code: "engine.decision-callid-must-match" });
    expect(ports.harness.sent).toEqual([]);
    expect(runs.logs.get("run_1")).toHaveLength(logged ?? -1);
  });
});
