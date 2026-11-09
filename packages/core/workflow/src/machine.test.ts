import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  acceptedEvents,
  dueTimer,
  getState,
  hasState,
  selectTransition,
  stateTimers,
} from "./machine.ts";
import { triage, workflowOf } from "./test/workflow.spec.ts";

const at = (iso: string) => new Date(iso);
const noData = { input: {}, context: {} };

verifies("workflow.select-transition", () => {
  // Ported from "transitions" › "picks the first matching transition in file order" at 784f78d.
  it("picks the first matching transition in file order", () => {
    const question = { input: {}, context: { category: "question" } };
    const bug = { input: {}, context: { category: "bug" } };
    expect(selectTransition(triage, "classify", "done", question)?.to).toBe("answer");
    expect(selectTransition(triage, "classify", "done", bug)?.to).toBe("review");
    expect(selectTransition(triage, "review", "approve", noData)?.to).toBe("done");
    expect(selectTransition(triage, "review", "done", noData)).toBeNull();
  });

  // New.
  it("never fires a timer transition on an event", () => {
    const workflow = workflowOf({
      id: "w",
      name: "W",
      initial: "wait",
      states: {
        wait: {
          type: "wait",
          on: [
            { to: "late", after: "1h" },
            { to: "end", event: "approve" },
          ],
        },
        late: { type: "final" },
        end: { type: "final" },
      },
    });
    expect(selectTransition(workflow, "wait", "done", noData)).toBeNull();
    expect(selectTransition(workflow, "wait", "approve", noData)?.to).toBe("end");
  });

  it("refuses a state the workflow doesn't have, inherited names too", () => {
    expect(() => getState(triage, "nowhere")).toThrow('Workflow "triage" has no state "nowhere"');
    expect(() => getState(triage, "constructor")).toThrow(/no state "constructor"/);
  });

  it("knows only the workflow's own states", () => {
    expect(hasState(triage, "classify")).toBe(true);
    expect(hasState(triage, "nowhere")).toBe(false);
    expect(hasState(triage, "constructor")).toBe(false);
  });
});

verifies("workflow.accepted-events", () => {
  // New: the old acceptedEvents had no test of its own.
  it("lists each event once, in file order, without timers", () => {
    const workflow = workflowOf({
      id: "w",
      name: "W",
      initial: "review",
      states: {
        review: {
          type: "wait",
          on: [
            { to: "end", event: "approve", when: { exists: "context.ok" } },
            { to: "end", event: "reject" },
            { to: "end", event: "approve" },
            { to: "end", after: "2d" },
          ],
        },
        end: { type: "final" },
      },
    });
    expect(acceptedEvents(workflow, "review")).toEqual(["approve", "reject"]);
    expect(acceptedEvents(triage, "done")).toEqual([]);
  });
});

verifies("workflow.state-timers", () => {
  // New: the old repo tested timers only through its engine.
  const workflow = workflowOf({
    id: "w",
    name: "W",
    initial: "wait",
    states: {
      wait: {
        type: "wait",
        on: [
          { to: "end", event: "approve" },
          { to: "remind", after: "1h", when: { exists: "context.owner" } },
          { to: "escalate", after: "1h" },
          { to: "drop", after: "2d" },
        ],
      },
      remind: { type: "final" },
      escalate: { type: "final" },
      drop: { type: "final" },
      end: { type: "final" },
    },
  });
  const entered = at("2026-11-03T08:00:00Z");

  it("starts one timer per timer transition, due that long after entering", () => {
    expect(stateTimers(workflow, "wait", entered)).toEqual([
      { index: 1, after: "1h", at: at("2026-11-03T09:00:00Z") },
      { index: 2, after: "1h", at: at("2026-11-03T09:00:00Z") },
      { index: 3, after: "2d", at: at("2026-11-05T08:00:00Z") },
    ]);
  });

  it("takes nothing before a timer is due", () => {
    expect(dueTimer(workflow, "wait", entered, at("2026-11-03T08:59:59Z"), noData)).toBeNull();
  });

  it("takes the earliest due timer whose guard passes, file order breaking ties", () => {
    const now = at("2026-11-06T00:00:00Z");
    const owner = { input: {}, context: { owner: "support" } };
    expect(dueTimer(workflow, "wait", entered, now, owner)?.to).toBe("remind");
    expect(dueTimer(workflow, "wait", entered, now, noData)?.to).toBe("escalate");
  });

  it("takes nothing when no due timer's guard passes", () => {
    const guarded = workflowOf({
      id: "w",
      name: "W",
      initial: "wait",
      states: {
        wait: { type: "wait", on: [{ to: "end", after: "30m", when: { exists: "context.ok" } }] },
        end: { type: "final" },
      },
    });
    expect(dueTimer(guarded, "wait", entered, at("2026-11-03T09:00:00Z"), noData)).toBeNull();
  });
});
