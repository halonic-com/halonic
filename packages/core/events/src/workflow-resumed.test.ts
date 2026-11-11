import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunEvent, RunEventBody, RunEventType } from "./run-event.ts";
import { runLog, summaryOf } from "./summarize.test-helper.ts";
import { summarize } from "./summarize.ts";
import { entryOf } from "./timeline-entry.ts";

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

const waiting: RunEventBody = {
  type: "run.waiting",
  state: "check",
  events: ["approve", "reject"],
  child: "c1",
  timers: [{ after: "2d", at: "2026-11-05T09:00:00.000Z" }],
};

const resumed: RunEventBody = { type: "workflow.resumed", state: "check", childRunId: "c1" };

/**
 * An event of a type this package doesn't know, as an older reader meets
 * `workflow.resumed`. The cast stands for a line parsed from a newer log.
 */
const unknownEvent = { type: "workflow.later", state: "check" } as unknown as RunEventBody;

verifies("events.workflow-resumed", () => {
  typeTest("names the state and the child run that runs again", () => {
    expectTypeOf<EventOf<"workflow.resumed">>().toEqualTypeOf<{
      type: "workflow.resumed";
      state: string;
      childRunId: string;
    }>();
  });

  it("reads the run as running again, waiting on nothing", () => {
    expect(summaryOf(waiting, resumed)).toMatchObject({
      status: "running",
      accepts: [],
      answerLabels: {},
      waitingOn: null,
      nextTimer: null,
      waitingFor: null,
    });
  });

  it("updates the entry of the wait it ends", () => {
    const entries = entryOf(runLog(waiting, resumed));

    expect(entries.slice(1)).toEqual([2, 2]);
  });

  it("skips an event of a type it doesn't know", () => {
    const withUnknown: RunEvent[] = runLog(waiting, unknownEvent);

    const { lastSeq: _seq, updatedAt: _at, ...summary } = summarize(withUnknown) ?? {};
    const { lastSeq: _seq2, updatedAt: _at2, ...without } = summaryOf(waiting);
    expect(summary).toEqual(without);
    expect(entryOf(withUnknown).at(-1)).toBe(3);
  });
});
