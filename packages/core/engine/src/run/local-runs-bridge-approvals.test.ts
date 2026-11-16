import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { harnessPorts, stillOpen } from "../harness/harness-test-kit.test-helper.ts";
import { KernelBlobs, KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { bridgeNoCallComment } from "./bridge-approvals.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const agents = { writer: writerAgent("claude-code") };

const bashCall = { callId: "toolu_9", tool: "Bash", args: { command: "rm -r drafts" } };

verifies("engine.bridge-approvals", () => {
  /** Starts the run with a Claude Code call that keeps running, so its bridge can ask. */
  async function runningCall() {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const runs = new KernelRuns();
    const setup = runsOn([], runs, { agents, harnesses: ports.options, blobs: new KernelBlobs() });
    await setup.executor.start(replyStart);
    const harnessCall = setup.scheduler.deliver("run_1", "harness:call-1");
    await vi.waitFor(() => expect(ports.harness.tasks).toHaveLength(1));
    const bridge = setup.executor.bridgeApprovals("run_1");
    const ask = (signal: AbortSignal = new AbortController().signal) =>
      bridge.request(bashCall, { signal });
    const waitsOn = (callId: string) =>
      vi.waitFor(async () =>
        expect(await runs.get("run_1")).toMatchObject({ approvals: [{ callId, tool: "Bash" }] }),
      );
    return { ...setup, ports, runs, harnessCall, ask, waitsOn };
  }

  it("records the question under the run's own call id and resolves with an allow", async () => {
    const { executor, runs, ask, waitsOn, harnessCall } = await runningCall();

    const decision = ask();
    await waitsOn("call-2");
    expect(await runs.get("run_1")).toMatchObject({ accepts: ["approve", "reject"] });
    await executor.send("run_1", "approve", { comment: "Fine" }, { callId: "call-2" });

    expect(await decision).toEqual({ approved: true, comment: "Fine" });
    expect(typesOf(runs.logs.get("run_1")).slice(-4)).toEqual([
      "approval.requested",
      "run.waiting",
      "event.received",
      "approval.resolved",
    ]);
    expect(await runs.get("run_1")).toMatchObject({ status: "running", approvals: [] });
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("resolves with a deny when the person rejects", async () => {
    const { executor, ask, waitsOn, harnessCall } = await runningCall();

    const decision = ask();
    await waitsOn("call-2");
    await executor.send("run_1", "reject", { comment: "No" }, { callId: "call-2" });

    expect(await decision).toEqual({ approved: false, comment: "No" });
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("takes the first of a card and a phone answering at once, and refuses the other", async () => {
    const { executor, ask, waitsOn, harnessCall } = await runningCall();

    const decision = ask();
    await waitsOn("call-2");
    const answers = await Promise.allSettled([
      executor.send("run_1", "approve", undefined, { callId: "call-2" }),
      executor.send("run_1", "reject", undefined, { callId: "call-2" }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
    const first = answers[0]?.status === "fulfilled";
    expect((await decision).approved).toBe(first);
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("refuses an unknown call id and a call id that was already answered", async () => {
    const { executor, runs, ask, waitsOn, harnessCall } = await runningCall();

    const decision = ask();
    await waitsOn("call-2");
    const unknown = executor.send("run_1", "approve", undefined, { callId: "toolu_9" });
    await expect(unknown).rejects.toMatchObject({ code: "engine.decision-callid-must-match" });
    await executor.send("run_1", "reject", undefined, { callId: "call-2" });
    await decision;
    const stale = executor.send("run_1", "approve", undefined, { callId: "call-2" });

    await expect(stale).rejects.toMatchObject({ code: "engine.decision-callid-must-match" });
    expect(typesOf(runs.logs.get("run_1")).filter((type) => type === "approval.resolved")).toEqual([
      "approval.resolved",
    ]);
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("asks one question at a time, in order", async () => {
    const { executor, ask, waitsOn, harnessCall } = await runningCall();

    const first = ask();
    const second = ask();
    await waitsOn("call-2");
    await executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await waitsOn("call-4");
    await executor.send("run_1", "reject", undefined, { callId: "call-4" });

    expect((await first).approved).toBe(true);
    expect((await second).approved).toBe(false);
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("is not approved when the run ended before the request", async () => {
    const { executor, ask, harnessCall } = await runningCall();
    await executor.cancel("run_1");
    await harnessCall;

    expect(await ask()).toEqual({ approved: false, comment: bridgeNoCallComment });
  });

  it("is not approved when the engine stops, or the run is cancelled, while the request waits", async () => {
    const stopped = await runningCall();
    const whileStopping = stopped.ask();
    await stopped.waitsOn("call-2");
    await stopped.executor.close();
    await stopped.harnessCall;
    expect((await whileStopping).approved).toBe(false);
    expect(stillOpen(stopped.ports.steps)).toBe(0);

    const cancelled = await runningCall();
    const whileCancelling = cancelled.ask();
    await cancelled.waitsOn("call-2");
    await cancelled.executor.cancel("run_1");
    await cancelled.harnessCall;
    expect((await whileCancelling).approved).toBe(false);
  });

  it("rejects when the request's signal aborts, and keeps the question for a person to answer", async () => {
    const { executor, ask, waitsOn, harnessCall } = await runningCall();
    const abort = new AbortController();

    const decision = ask(abort.signal);
    await waitsOn("call-2");
    abort.abort(new Error("The program went away."));

    await expect(decision).rejects.toThrow("The program went away.");
    await waitsOn("call-2");
    await executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("never asks a request that was withdrawn while it waited its turn", async () => {
    const { executor, runs, ask, waitsOn, harnessCall } = await runningCall();
    const abort = new AbortController();

    const first = ask();
    await waitsOn("call-2");
    const second = ask(abort.signal);
    abort.abort(new Error("The program went away."));
    await expect(second).rejects.toThrow("The program went away.");
    await executor.send("run_1", "approve", undefined, { callId: "call-2" });

    expect((await first).approved).toBe(true);
    await vi.waitFor(async () =>
      expect(await runs.get("run_1")).toMatchObject({ status: "running", approvals: [] }),
    );
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("is not approved when the executor runs no workflows", async () => {
    const { executor } = runsOn([], new KernelRuns(), {});

    const decision = await executor
      .bridgeApprovals("run_1")
      .request(bashCall, { signal: new AbortController().signal });

    expect(decision.approved).toBe(false);
  });
});
