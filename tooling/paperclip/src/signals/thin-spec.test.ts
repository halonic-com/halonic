import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  checkEvent,
  checkedTask,
  checkHarness,
  checkSwitchOn,
  type FakeCheckedTask,
  reading,
  testModel,
} from "../plugin/thin-spec-check.test-helper.ts";
import { type CheckRecord, dayLogKey } from "../plugin/thin-spec-check.ts";
import { clarifyDescription, isClarifyTask } from "../thin-spec/clarify.ts";
import { doneWhenText } from "../thin-spec/done-when.ts";
import { parseReading } from "../thin-spec/reading.ts";
import { thinSpecScore } from "../thin-spec/score.ts";
import { decide, type SpecTask, type ThinSpecAction } from "./rules/thin-spec.ts";

/**
 * Today's thin-spec check fixtures (`plugin/thin-spec-check.test.ts`) and
 * `Done when` lint fixtures (`plugin/done-when-lint.test.ts`), replayed
 * through the `thin-spec` rule (HAL-18319): for each, the rule reads, logs,
 * comments and clarifies exactly where the check does.
 */

const now = "2026-11-23T12:00:00.000Z";
const defaults = { threshold: 0.5, upTo: 4, newForHours: 24, doneWhen: true };
const vague = reading(1);
const exact = reading(5);
const noClarifier = { settings: { ...checkSwitchOn, thinSpecClarifier: "" } };

type Options = Parameters<typeof checkHarness>[2];

/** Each fixture: the task, Haiku's one answer, and the harness options. */
const fixtures: [string, FakeCheckedTask, string | number, Options][] = [
  ["a flagged task", checkedTask(), vague, {}],
  ["a flagged task with blockers", checkedTask(), vague, { blockedBy: ["task-7"] }],
  ["a flagged task a person created", checkedTask({ createdByAgentId: null }), vague, {}],
  [
    "a flagged task without a clarifier",
    checkedTask({ createdByAgentId: null }),
    vague,
    noClarifier,
  ],
  ["an unflagged task", checkedTask(), exact, {}],
  ["a failed call", checkedTask(), 500, {}],
  ["no D label", checkedTask({ labels: [{ id: "label-docs", name: "docs" }] }), vague, {}],
  ["no agent", checkedTask({ assigneeAgentId: null }), vague, {}],
  ["already started", checkedTask({ status: "in_progress" }), vague, {}],
  ["two days old", checkedTask({ createdAt: "2026-11-21T11:00:00Z" }), vague, {}],
  [
    "a clarify task",
    checkedTask({ title: "Clarify acceptance criteria: HAL-0 Something" }),
    vague,
    {},
  ],
  ["no Done when, a clear score", checkedTask({ description: "It is slow." }), exact, {}],
  ["no Done when, a flagged score", checkedTask({ description: "It is slow." }), vague, {}],
];

/** The `Done when` lint's detector inputs, each as a task's description. */
const descriptions: [string, string | null][] = [
  ["no Done when line", "Make the export faster. It is slow."],
  ["a Done when line that names nothing checkable", "Fix it.\n\nDone when: works"],
  ["an empty Done when heading", "Fix it.\n\n## Done when\n\nScope: export."],
  ["no description", null],
  ["a test path", "Fix the export.\n\nDone when: src/export.test.ts passes."],
  ["a spec path", "Fix the export.\n\n**Done when:** flow.spec.tsx is green in CI."],
  ["a named test", 'Fix the export.\n\nDone when: the test "exports twice" passes.'],
  ["a backticked command", "Fix the export.\n\nDone when: `pnpm check` passes on main."],
  ["what the user sees", "Fix the export.\n\nDone when: the user sees the export finish in 2 s."],
  [
    "what the CLI prints",
    "Fix the export.\n\nDone when: halonic run prints the run id and exits 0.",
  ],
  ["a Done when heading", "Fix the export.\n\n## Done when\n\nThe screen shows the new label."],
];

/** Today's check on one event, as the rule's actions. */
async function todayActions(task: FakeCheckedTask, answer: string | number, options: Options) {
  const { check, asked, sent, saved } = checkHarness(task, [answer], options);
  await check.onIssueEvent(checkEvent());
  const actions: ThinSpecAction[] = asked.length > 0 ? [{ kind: "read", task: task.id }] : [];
  const log = saved.get(JSON.stringify(dayLogKey("acme", "2026-11-23"))) as
    | CheckRecord[]
    | undefined;
  const record = log?.[0];
  if (record === undefined) {
    return actions;
  }
  const { taskId, clarifyId, clarifyFailure, ...logged } = record;
  actions.push({ kind: "record", task: taskId, doneWhenMissing: false, ...logged });
  if (sent.some((request) => request.path === `/api/issues/${taskId}/comments`)) {
    actions.push({ kind: "comment-done-when", task: taskId });
  }
  if (clarifyFailure === "no_clarifier") {
    actions.push({ kind: "no-clarifier", task: taskId });
  }
  const created = sent.find((request) => request.path === "/api/companies/acme/issues");
  if (created !== undefined) {
    const body = created.body as { assigneeAgentId: string; description: string };
    const missing = record.doneWhenMissing ?? false;
    const reasons = {
      ...(record.flagged ? { score: record.score } : {}),
      doneWhenMissing: missing,
    };
    expect(body.description).toBe(clarifyDescription({ identifier: record.identifier }, reasons));
    const { assigneeAgentId } = body;
    actions.push({
      kind: "clarify",
      task: taskId,
      identifier: record.identifier,
      assigneeAgentId,
      reasons,
    });
  }
  return actions;
}

/** The rule's view of a task: its text only as its `Done when` text, its score as a fact. */
function ruleTask(task: FakeCheckedTask, score: number | null, checked = false): SpecTask {
  return {
    id: task.id,
    identifier: task.identifier,
    status: task.status,
    assigneeAgentId: task.assigneeAgentId,
    createdByAgentId: task.createdByAgentId,
    createdAt: task.createdAt,
    labels: task.labels.map((label) => label.name),
    clarifyTask: isClarifyTask(task.title),
    checked,
    score,
    doneWhenText: doneWhenText(task.description ?? "") ?? null,
  };
}

/** The score today's check works out from an answer, or null when the call failed. */
function scoreOf(answer: string | number): number | null {
  const parsed = typeof answer === "string" ? parseReading(answer) : undefined;
  return parsed === undefined ? null : thinSpecScore(testModel, parsed);
}

function input(tasks: SpecTask[], options: Options = {}, settings = defaults) {
  const clarifier = options?.settings?.["thinSpecClarifier"] ?? checkSwitchOn.thinSpecClarifier;
  return { now, settings, clarifierAgentId: clarifier === "pm" ? "agent-pm" : null, tasks };
}

/** The rule over two passes: before the reading, then with its score. */
function ruleActions(task: FakeCheckedTask, answer: string | number, options: Options) {
  const before = decide(JSON.parse(JSON.stringify(input([ruleTask(task, null)], options))));
  const score = scoreOf(answer);
  if (before.length === 0 || score === null) {
    return before;
  }
  return [...before, ...decide(input([ruleTask(task, score)], options))];
}

verifies("paperclip.signal-thin-spec", () => {
  test.each(fixtures)("gives today's actions for %s", async (_, task, answer, options) => {
    expect(ruleActions(task, answer, options)).toEqual(await todayActions(task, answer, options));
  });

  test.each(descriptions)("gives today's Done when actions for %s", async (_, description) => {
    const task = checkedTask({ description });
    expect(ruleActions(task, exact, {})).toEqual(await todayActions(task, exact, {}));
  });

  test("between the fixtures, reads, records, comments, clarifies and finds no clarifier", async () => {
    const kinds = new Set<string>();
    for (const [, task, answer, options] of fixtures) {
      for (const action of await todayActions(task, answer, options)) {
        kinds.add(action.kind);
      }
    }
    expect([...kinds].sort()).toEqual([
      "clarify",
      "comment-done-when",
      "no-clarifier",
      "read",
      "record",
    ]);
  });

  test("checks a task once, and leaves a task whose writer started to the executor", () => {
    expect(decide(input([ruleTask(checkedTask(), 0.88, true)]))).toEqual([]);
    const flagged = decide(input([ruleTask(checkedTask(), 0.88)]));
    expect(flagged.map((action) => action.kind)).toEqual(["record", "clarify"]);
  });

  test("takes a higher threshold, a lower hardest tag, a longer window and the lint off", () => {
    const task = ruleTask(checkedTask({ description: "It is slow." }), 0.88);
    const strict = { ...defaults, threshold: 0.9, doneWhen: false };
    expect(decide(input([task], {}, strict))).toMatchObject([{ kind: "record", flagged: false }]);
    expect(decide(input([task], {}, { ...defaults, upTo: 1 }))).toEqual([]);
    const old = ruleTask(checkedTask({ createdAt: "2026-11-21T11:00:00Z" }), 0.88);
    expect(decide(input([old]))).toEqual([]);
    expect(decide(input([old], {}, { ...defaults, newForHours: 72 })).length).toBeGreaterThan(0);
  });

  test("never copies a task's title or text into an action", () => {
    const task = checkedTask({ description: "A private line.\n\nDone when: it works" });
    const actions = JSON.stringify(decide(input([ruleTask(task, 0.88)])));
    expect(actions).not.toContain("private line");
    expect(actions).not.toContain("it works");
    expect(actions).not.toContain(task.title);
  });
});
