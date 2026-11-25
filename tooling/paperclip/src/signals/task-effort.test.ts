import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { decideEffort, type EffortRecord } from "../task-effort/decide.ts";
import { effortForTask, tagsFromLabels } from "../task-effort/rules.ts";
import { decide, type EffortTask, type TaskEffortAction } from "./rules/task-effort.ts";

/**
 * Today's task effort table and guard, replayed through the `task-effort`
 * rule (HAL-18196): the label sets of `task-effort/rules.test.ts`, with
 * every record, effort and event variant, give the same actions as
 * `effortForTask` and `decideEffort`.
 */

const now = "2026-11-25T10:00:00Z";
const defaults = { highFrom: 4, highAfterSendBack: true };

/** The label sets `task-effort/rules.test.ts` reads. */
const labelSets = [
  ["D1"],
  ["D2"],
  ["d3 "],
  ["D1", "opus-only"],
  ["D2", "sandbox"],
  ["security"],
  ["trust"],
  ["schema"],
  ["secrets"],
  ["sign-in"],
  ["oauth"],
  ["keychain"],
  ["D4"],
  ["D5"],
  ["D2", "D4"],
  ["D3"],
  [],
  ["docs"],
  ["D6", "D0", "D"],
];

const record = (overrides: Partial<EffortRecord> = {}): EffortRecord => ({
  set: null,
  seen: null,
  assigneeAgentId: "agent-mateo",
  sentBack: false,
  handsOff: false,
  ...overrides,
});

const befores: (EffortRecord | undefined)[] = [
  undefined,
  record(),
  record({ set: "low", seen: "low" }),
  record({ set: "high", seen: "high", sentBack: true }),
  record({ seen: "max", handsOff: true }),
];

const efforts = [null, "low", "high", "max"];

const events = [
  { created: true, sentBackNow: false, withReviewer: false },
  { created: false, sentBackNow: false, withReviewer: false },
  { created: false, sentBackNow: true, withReviewer: false },
  { created: false, sentBackNow: false, withReviewer: true },
];

/** Today's decision as the rule's actions. */
function todayActions(task: EffortTask, before: EffortRecord | undefined): TaskEffortAction[] {
  const decision = decideEffort(
    { effort: task.effort, labelNames: task.labels, assigneeAgentId: task.assigneeAgentId },
    before,
    task,
  );
  const key = (what: string) => `${task.task}|${task.event}|${what}`;
  const report: TaskEffortAction[] =
    decision.foreign === undefined
      ? []
      : [{ kind: "report-foreign", key: key("foreign"), task: task.task, ...decision.foreign }];
  if (decision.write === undefined) {
    return [
      ...report,
      { kind: "remember", key: key("remember"), task: task.task, record: decision.record },
    ];
  }
  return [
    ...report,
    {
      kind: "set-effort",
      key: key("set-effort"),
      task: task.task,
      effort: decision.write,
      record: decision.record,
      recordUnwritten: decision.recordUnwritten,
    },
  ];
}

/** A new task with an agent and no effort yet. */
function newTask(labels: readonly string[], sentBackNow: boolean): EffortTask {
  return {
    task: "HAL-1",
    event: "event-1",
    effort: null,
    labels,
    assigneeAgentId: "agent-mateo",
    before: null,
    created: true,
    sentBackNow,
    withReviewer: false,
  };
}

function cases() {
  return labelSets.flatMap((labels) =>
    befores.flatMap((before) =>
      efforts.flatMap((effort) =>
        events.flatMap((event) =>
          ["agent-mateo", null].map((assigneeAgentId) => ({
            before,
            task: {
              task: "HAL-1",
              event: "event-1",
              effort,
              labels,
              assigneeAgentId,
              before: before ?? null,
              ...event,
            },
          })),
        ),
      ),
    ),
  );
}

verifies("paperclip.signal-task-effort", () => {
  test("gives today's actions for every label set, record, effort and event", () => {
    const all = cases();
    const written = new Set<string>();
    for (const { before, task } of all) {
      const rule = decide(JSON.parse(JSON.stringify({ now, settings: defaults, tasks: [task] })));
      expect(rule).toEqual(todayActions(task, before));
      for (const action of rule) {
        written.add(action.kind === "set-effort" ? `set ${action.effort}` : action.kind);
      }
    }
    expect(all).toHaveLength(19 * 5 * 4 * 4 * 2);
    expect([...written].sort()).toEqual([
      "remember",
      "report-foreign",
      "set high",
      "set low",
      "set null",
    ]);
  });

  test("sets the table's effort for each label set, sent back or not, like effortForTask", () => {
    for (const labels of labelSets) {
      for (const sentBack of [false, true]) {
        const [action] = decide({ now, settings: defaults, tasks: [newTask(labels, sentBack)] });
        const today = effortForTask(tagsFromLabels(labels, sentBack)) ?? null;
        expect(action?.kind === "set-effort" ? action.effort : null).toBe(today);
      }
    }
  });

  test("takes the signal's settings: high from D3, and no high after a send-back", () => {
    const settings = { highFrom: 3, highAfterSendBack: false };
    const tasks = [newTask(["D3"], false), newTask(["D2"], true)];
    const set = decide({ now, settings, tasks });
    expect(
      set.map((action) => (action.kind === "set-effort" ? action.effort : action.kind)),
    ).toEqual(["high", "low"]);
  });
});
