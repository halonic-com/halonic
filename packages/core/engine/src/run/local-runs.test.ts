import { ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { textAnswer } from "../testing/scripted-model.ts";
import { HeldRuns, replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

verifies("engine.local-runs", () => {
  it("records the start, then runs the model call from its timer to the end", async () => {
    const { executor, model, runs, scheduler } = runsOn([textAnswer("Dear support")]);

    const started = await executor.start(replyStart);

    expect(started).toMatchObject({ id: "run_1", status: "running", hubId: "acme" });
    expect([...scheduler.timers.values()].map((timer) => timer.timerId)).toEqual(["call:call-1"]);
    expect(model.requests).toEqual([]);

    await scheduler.runDue();

    expect(model.requests[0]?.messages).toEqual([{ role: "user", content: "Reply to support" }]);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
  });

  it("calls the model once when the call's timer arrives twice", async () => {
    const { executor, model, runs, scheduler } = runsOn([textAnswer("Dear support")]);
    await executor.start(replyStart);

    await scheduler.runDue(2);
    await executor.onTimer({ key: "run_1", timerId: "call:call-1", at: "" });

    expect(model.requests).toHaveLength(1);
    expect(typesOf(runs.logs.get("run_1")).filter((type) => type === "agent.finished")).toEqual([
      "agent.finished",
    ]);
  });

  it("calls the model once when a second delivery's read ends after the first call", async () => {
    const { executor, model, runs } = runsOn([textAnswer("Dear support")], new HeldRuns());
    await executor.start(replyStart);
    const timer = { key: "run_1", timerId: "call:call-1", at: "" };

    const release = runs.holdNextRead();
    const late = executor.onTimer(timer);
    await executor.onTimer(timer);
    release();
    await late;

    expect(model.requests).toHaveLength(1);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("returns the existing run for a repeated run id and records nothing", async () => {
    const { executor, runs, definitionsAsked } = runsOn([]);
    await executor.start({ ...replyStart, runId: "fire-1" });

    const again = await executor.start({ ...replyStart, workflowId: "other", runId: "fire-1" });

    expect(again).toMatchObject({ id: "fire-1", workflowId: "reply" });
    expect(definitionsAsked).toEqual(["acme/reply"]);
    expect(runs.logs.get("fire-1")).toHaveLength(3);
  });

  it("refuses a run id over 256 bytes, or a missing workflow, before recording", async () => {
    const { executor, runs } = runsOn([]);

    await expect(executor.start({ ...replyStart, runId: "é".repeat(129) })).rejects.toThrow(
      RangeError,
    );
    await expect(executor.start({ ...replyStart, workflowId: "gone" })).rejects.toThrow(
      'No workflow "gone".',
    );
    expect(runs.logs.size).toBe(0);
  });

  it("ends the runs a stopped engine lost before it starts the first run", async () => {
    const before = runsOn([]);
    await before.executor.start(replyStart);

    const after = runsOn([], before.runs);
    await after.executor.start({ ...replyStart, runId: "run_2" });

    expect(await before.runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "interrupted",
    });
    expect(await before.runs.get("run_2")).toMatchObject({ status: "running" });
  });

  it("streams the run's events to a subscriber until it ends", async () => {
    const { executor, scheduler } = runsOn([textAnswer("Dear support")]);
    await executor.start(replyStart);
    const seqs: number[] = [];
    const closed = new Promise<Error | undefined>((resolve) => {
      executor.subscribe("run_1", 1, {
        onEvent: (event) => seqs.push(event.seq),
        onClose: resolve,
      });
    });

    await scheduler.runDue();

    expect(await closed).toBeUndefined();
    expect(seqs).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it("refuses a send the run doesn't take, and ignores a timer it doesn't know", async () => {
    const { executor, runs } = runsOn([]);
    await executor.start(replyStart);

    await expect(executor.send("run_1", "approve", { ok: true })).rejects.toThrow(
      `doesn't take "approve" in state "draft" now`,
    );
    await expect(executor.send("r-missing", "approve")).rejects.toThrow("has not started");
    await executor.onTimer({ key: "run_1", timerId: "timer:wait", at: "" });
    await executor.onTimer({ key: "run_1", timerId: "other", at: "" });
    expect(runs.logs.get("run_1")).toHaveLength(3);
  });
});

verifies("engine.run-call-fails", () => {
  it("fails the run with the reason and host of the model's error", async () => {
    const offline = new ModelCallError("offline", "The model didn't answer.", {
      host: "models.acme.test",
    });
    const { executor, runs, scheduler } = runsOn([offline]);
    await executor.start(replyStart);

    await scheduler.runDue();

    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({
      type: "run.failed",
      state: "draft",
      reason: "model-unreachable",
      host: "models.acme.test",
    });
  });

  it("fails the run with reason error for any other error", async () => {
    const { executor, runs, scheduler } = runsOn([new Error("socket hang up")]);
    await executor.start(replyStart);

    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "error",
      error: expect.stringContaining("socket hang up"),
    });
  });
});
