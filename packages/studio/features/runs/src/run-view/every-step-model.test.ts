import { type RunEventBody, summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunWorkflow } from "../api.ts";
import { mondayMorning } from "../summary.test-helper.ts";
import { everyStep } from "./every-step-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";

const supportReply: RunWorkflow = {
  name: "Support reply",
  stepDescription: (stateId) =>
    stateId === "review" ? "Approve this reply?\nSam waits." : undefined,
};

/** The timeline of a run whose log is `timed`, as the page shows it at 10:40. */
function stepsOf(timed: readonly (readonly [number, RunEventBody])[]) {
  const events = logOf("run_a_01jd8q", timed);
  const summary = summarize(events);
  if (summary === null) throw new Error("The test log has no run.started.");
  return everyStep(events, summary, supportReply, mondayMorning);
}

const failedIn = (state: string, reason?: "cancelled" | "budget"): RunEventBody => ({
  type: "run.failed",
  state,
  error: "Model refused",
  ...(reason === undefined ? {} : { reason }),
});

verifies("runs.every-step", () => {
  it("names each step the run reached, with what happened, its time and its mark", () => {
    const steps = stepsOf([
      [0, entered("read")],
      [1, entered("review")],
      [1, { type: "run.waiting", state: "review", events: ["approve", "reject"] }],
      [3, { type: "event.received", event: "approve" }],
      [3, entered("draft")],
    ]);

    expect(steps.map(({ name, mark, line, time }) => [name, mark, line, time])).toEqual([
      ["Read", "done", "Took 1 min", "10:40"],
      ["Approve this reply?", "done", "You approved at 10:43", "10:41"],
      ["Draft", "running", "Running", "10:43"],
    ]);
    expect(steps.map((step) => step.id)).toEqual(["step-0", "step-1", "step-2"]);
  });

  it("is read with its state first", () => {
    const [read, draft] = stepsOf([
      [0, entered("read")],
      [1, entered("draft")],
      [1, failedIn("draft")],
    ]);
    expect(read?.label).toBe("Read, done, 10:40, Took 1 min");
    expect(draft?.label).toBe("Draft, failed, 10:41, Failed after 1 s");
    expect(draft?.mark).toBe("failed");
  });

  it("stops the step a run was cancelled in or reached its budget in, without red", () => {
    const cancelled = stepsOf([
      [0, entered("classify")],
      [2, failedIn("classify", "cancelled")],
    ]).at(-1);
    expect(cancelled).toMatchObject({
      mark: "stopped",
      line: "Cancelled in this step",
      label: "Classify, cancelled, 10:40, Cancelled in this step",
    });
    const budget = stepsOf([
      [0, entered("draft")],
      [3, failedIn("draft", "budget")],
    ]).at(-1);
    expect(budget).toMatchObject({ mark: "stopped", line: "Budget reached after 3 min" });
  });

  it("says what the last step waits for: a person, a child run or a time", () => {
    const waitingAt = (body: RunEventBody) =>
      stepsOf([
        [0, entered("review")],
        [1, body],
      ]).at(-1);

    expect(waitingAt({ type: "run.waiting", state: "review", events: ["approve"] })).toMatchObject({
      mark: "needs-you",
      line: "Waiting for you",
    });
    expect(
      waitingAt({ type: "run.waiting", state: "review", events: [], child: "run_x_7k2m9p" }),
    ).toMatchObject({ mark: "running", line: "Waiting for child run 7k2m9p" });
    expect(
      waitingAt({
        type: "run.waiting",
        state: "review",
        events: [],
        timers: [{ after: "4h", at: new Date(2026, 10, 9, 14, 0).toISOString() }],
      }),
    ).toMatchObject({ mark: "running", line: "Waiting until 14:00" });
  });

  it("names the answer as written when it isn't approve or reject", () => {
    const answered = stepsOf([
      [0, entered("review")],
      [0, { type: "run.waiting", state: "review", events: ["hold"] }],
      [2, { type: "event.received", event: "hold" }],
      [2, entered("draft")],
    ])[0];
    expect(answered?.line).toBe("You answered hold at 10:42");
  });
});
