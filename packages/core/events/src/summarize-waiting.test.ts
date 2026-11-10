import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";

verifies("events.waiting-description", () => {
  const waiting = (fields: { title?: string; body?: string }): RunEventBody => ({
    type: "run.waiting",
    state: "review",
    events: ["approve", "reject"],
    ...fields,
  });

  it("holds the filled-in title and body while the run waits", () => {
    expect(
      summaryOf(waiting({ title: "Approve this reply?", body: "Hello Ada" })).waitingFor,
    ).toEqual({
      title: "Approve this reply?",
      body: "Hello Ada",
    });
    expect(summaryOf(waiting({ title: "Approve this reply?" })).waitingFor).toEqual({
      title: "Approve this reply?",
      body: "",
    });
  });

  it("is null for a wait without a description, as in older logs", () => {
    expect(summaryOf(waiting({})).waitingFor).toBeNull();
  });

  it("is null again once the run goes on", () => {
    const summary = summaryOf(waiting({ title: "Approve this reply?" }), {
      type: "event.received",
      event: "approve",
    });
    expect(summary.waitingFor).toBeNull();
  });
});

verifies("events.answer-labels", () => {
  const waiting = (labels?: Record<string, string>): RunEventBody => ({
    type: "run.waiting",
    state: "review",
    events: ["approve", "reject"],
    ...(labels === undefined ? {} : { labels }),
  });

  it("holds the answers' labels while the run waits", () => {
    expect(summaryOf(waiting({ approve: "Send reply" })).answerLabels).toEqual({
      approve: "Send reply",
    });
  });

  it("is empty for a wait without labels, as in older logs", () => {
    expect(summaryOf(waiting()).answerLabels).toEqual({});
  });

  it("is empty again once the run goes on", () => {
    const summary = summaryOf(waiting({ approve: "Send reply" }), {
      type: "event.received",
      event: "approve",
    });
    expect(summary.answerLabels).toEqual({});
  });
});

verifies("events.summary-waiting", () => {
  const waiting: RunEventBody = {
    type: "run.waiting",
    state: "w",
    events: ["approve", "reject"],
    child: "c1",
    timers: [
      { after: "2h", at: "2026-11-05T09:00:00.000Z" },
      { after: "1h", at: "2026-11-05T08:00:00.000Z" },
    ],
  };

  it("says what the run waits for and when its earliest timer is due", () => {
    expect(summaryOf(waiting)).toMatchObject({
      status: "waiting",
      accepts: ["approve", "reject"],
      waitingOn: "c1",
      nextTimer: "2026-11-05T08:00:00.000Z",
    });
  });

  it("keeps the time of the last run.waiting after the run goes on", () => {
    const summary = summaryOf(
      waiting,
      { type: "event.received", event: "approve" },
      { type: "run.waiting", state: "w2", events: ["go"] },
      { type: "event.received", event: "go" },
    );
    expect(summary).toMatchObject({ status: "running", lastWaitingAt: "T4" });
  });

  it("has no next timer and no child when the wait has neither", () => {
    expect(summaryOf({ type: "run.waiting", state: "w", events: ["go"] })).toMatchObject({
      waitingOn: null,
      nextTimer: null,
    });
    expect(
      summaryOf({ type: "run.waiting", state: "w", events: [], timers: [] }).nextTimer,
    ).toBeNull();
  });

  const wakeUps: RunEventBody[] = [
    { type: "timer.fired", state: "w", after: "1h" },
    { type: "event.received", event: "approve" },
    {
      type: "workflow.finished",
      state: "w",
      workflow: "child",
      childRunId: "c1",
      status: "completed",
    },
  ];
  for (const wakeUp of wakeUps) {
    it(`runs again and clears the wait after ${wakeUp.type}`, () => {
      expect(summaryOf(waiting, wakeUp)).toMatchObject({
        status: "running",
        accepts: [],
        waitingOn: null,
        nextTimer: null,
      });
    });
  }

  it("runs again when a new state is entered", () => {
    expect(summaryOf(waiting, { type: "state.entered", state: "next" }).status).toBe("running");
  });

  it("stays done when a state is entered after the end", () => {
    const summary = summaryOf(
      { type: "run.failed", state: null, error: "x" },
      { type: "state.entered", state: "s" },
    );
    expect(summary.status).toBe("failed");
  });
});
