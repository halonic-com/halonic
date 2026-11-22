import type { FileProblem } from "@halonicjs/format";
import {
  CronError,
  checkTimeZone,
  parseCron,
  parseEvery,
  triggerValueProblems,
} from "@halonicjs/routines";
import { nearMatch } from "@halonicjs/std";
import { didYouMean, inputReads, missingStartFields, readsWholeInput } from "@halonicjs/workflow";
import type { LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

type Routine = LoadedFileOf<"routine">;

/** One thing wrong with a routine, before it gets its file and line. */
interface RoutineProblem {
  readonly path: FileProblem["path"];
  readonly code: string;
  readonly message: string;
}

/**
 * What a routine names and when it starts: the hub, workflow or agent it
 * runs, the connector whose mailbox it watches, and its cron, time zone and
 * intervals. Each message follows `Routine "<id>": `. The target and mailbox
 * messages are the old loader's; a trigger's message is the one the routines
 * package's parser gives.
 *
 * A routine in a hub runs that hub's workflows and agents. One at the root
 * names its hub in `run.hub`, unless the root has agents or workflows of its
 * own, except a webhook routine, which always needs a hub: its request
 * starts a run in one. A routine in a hub whose `hub.yaml` failed isn't checked: the old
 * loader left that hub out. Nor is what a root routine names in such a hub: "unknown hub"
 * would send the user to the routine, when the hub's own errors say what to fix (HAL-15207).
 * For the same reason a root agent or workflow that failed still counts as the root's own work.
 *
 * A key of a workflow routine's input that no step of the workflow reads as
 * `input.<key>` is a warning, with "Did you mean" for a close one (HAL-14316).
 * An input without a field the workflow's first step reads is an error: the
 * run would start with nothing where that field goes (HAL-14777).
 *
 * Each `{{…}}` in its input or prompt that isn't a value of its trigger is an
 * error too, since the run would get an empty text (HAL-14298).
 */
export function checkRoutines(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const routine of context.filesOf("routine")) {
    if (context.hubFailed(routine.hub)) {
      continue;
    }
    // A root routine whose run.hub names a hub that failed: the hub's own errors say what to fix,
    // and its workflows, agents and connectors were left out, so nothing it names can be checked.
    if (routine.hub === null && context.hubFailed(routine.value.run.hub ?? null)) {
      issues.push(...problemIssues(context, routine, triggerProblems(routine)));
      continue;
    }
    const problems = [
      targetProblem(context, routine),
      mailProblem(context, routine),
      ...triggerProblems(routine),
    ];
    issues.push(
      ...problemIssues(context, routine, problems),
      ...unreadInputIssues(context, routine),
      ...startInputIssues(context, routine),
    );
  }
  return issues;
}

/** The first cron, time zone or interval that doesn't parse, and each unknown `{{trigger.…}}`. */
function triggerProblems(routine: Routine): (RoutineProblem | null)[] {
  return [
    triggerProblem(routine),
    ...triggerValueProblems(routine.value).map((problem) => ({
      ...problem,
      path: [...problem.path],
      code: "unknown-trigger-value",
    })),
  ];
}

/** Each problem as an error on the routine's file, after `Routine "<id>": `. */
function problemIssues(
  context: CheckContext,
  routine: Routine,
  problems: readonly (RoutineProblem | null)[],
): WorkspaceIssue[] {
  return problems
    .filter((problem) => problem !== null)
    .map((problem) => {
      const message = `Routine "${routine.value.id}": ${problem.message}`;
      return context.error(routine.path, problem.path, problem.code, message);
    });
}

/**
 * An error when the routine's input lacks a field its workflow's first step
 * reads by name: "Monday note starts announce without topic, which its
 * first step reads." A key whose value is a `{{trigger.…}}` template counts
 * as given.
 */
function startInputIssues(context: CheckContext, routine: Routine): WorkspaceIssue[] {
  const run = routine.value.run;
  if (!("workflow" in run)) {
    return [];
  }
  const workflow = workflowOf(context, routine, run.workflow);
  const lacks = workflow && missingStartFields(workflow, Object.keys(run.input));
  if (!lacks) {
    return [];
  }
  const fields = listed(lacks.missing);
  const message = `${routine.value.name} starts ${run.workflow} without ${fields}, which its first step reads. Add ${fields} under run.input.`;
  return [context.error(routine.path, ["run", "input"], "missing-routine-input", message)];
}

/** The workflow a routine runs, from its hub; `undefined` when there's none by that id. */
function workflowOf(context: CheckContext, routine: Routine, id: string) {
  return context.filesOf("workflow", hubOf(routine) ?? null).find((file) => file.value.id === id)
    ?.value;
}

/**
 * A warning for each key of a routine's workflow input that no step reads,
 * such as `dya` when the steps read `input.day`: the run would start with
 * the field the steps need missing. A workflow with a step that sends its
 * agent the whole input reads every key, so it isn't checked.
 */
function unreadInputIssues(context: CheckContext, routine: Routine): WorkspaceIssue[] {
  const run = routine.value.run;
  if (!("workflow" in run)) {
    return [];
  }
  const workflow = workflowOf(context, routine, run.workflow);
  const states = Object.entries(workflow?.states ?? {});
  if (workflow === undefined || states.some(([, state]) => readsWholeInput(state))) {
    return [];
  }
  const read = [
    ...new Set(states.flatMap(([id, state]) => inputReads(id, state).map(({ field }) => field))),
  ];
  return Object.keys(run.input)
    .filter((key) => !read.includes(key))
    .map((key) => {
      const message = `Routine "${routine.value.id}": workflow "${run.workflow}" doesn't read input.${key}. ${unreadHint(key, read, Object.keys(run.input))}`;
      const path = ["run", "input", key];
      return context.issue("warning", routine.path, path, "unread-routine-input", message);
    });
}

/**
 * "Did you mean input.day?" for a close field, or else the fields the steps
 * read. Fields the routine already gives are left out of both: renaming the
 * key to one of them would give that field twice.
 */
function unreadHint(key: string, read: readonly string[], given: readonly string[]): string {
  if (read.length === 0) {
    return `No step reads an input field: remove the key, or add input.${key} to the gets of the step that needs it.`;
  }
  const open = read.filter((field) => !given.includes(field));
  const near = nearMatch(key, open);
  if (near !== undefined) {
    return `Did you mean input.${near}?`;
  }
  if (open.length === 0) {
    return "The routine already gives every field its steps read: remove the key.";
  }
  const to = open.length === 1 ? "that" : "one of those";
  const also = open.length < read.length ? " also" : "";
  return `Its steps${also} read ${listed(open.map((field) => `input.${field}`))}: rename the key to ${to}, or remove it.`;
}

/** `a`, `a and b`, `a, b and c`. */
function listed(values: readonly string[]): string {
  return values.length < 2
    ? values.join("")
    : `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

/**
 * The hub a routine runs in: its own, or at the root the one `run.hub`
 * names. `null` is the root itself; `undefined` means a root routine
 * without `run.hub`.
 */
function hubOf(routine: Routine): string | null | undefined {
  return routine.hub ?? routine.value.run.hub;
}

function targetProblem(context: CheckContext, routine: Routine): RoutineProblem | null {
  const run = routine.value.run;
  if (routine.hub !== null && run.hub !== undefined && run.hub !== routine.hub) {
    const message = `it lives in hub "${routine.hub}" and can only run that hub's workflows and agents`;
    return { path: ["run", "hub"], code: "routine-in-other-hub", message };
  }
  let hub = hubOf(routine);
  if (hub === undefined) {
    if (!rootHasWork(context)) {
      const message =
        "workspace-level routines need run.hub (or agents/ and workflows/ at the root)";
      return { path: ["run", "hub"], code: "routine-without-hub", message };
    }
    if ("webhook" in routine.value.trigger) {
      const message = "a webhook routine runs in a hub, so a root one must name it in run.hub";
      return { path: ["run", "hub"], code: "webhook-routine-without-hub", message };
    }
    hub = null;
  } else if (routine.hub === null && hub !== null && context.filesOf("hub", hub).length === 0) {
    return { path: ["run", "hub"], code: "unknown-hub", message: `unknown hub "${hub}"` };
  }
  // A file that is there but failed has its own errors; "unknown" would blame the routine.
  if ("workflow" in run) {
    return context.nameableIds("workflow", hub).has(run.workflow)
      ? null
      : {
          path: ["run", "workflow"],
          code: "unknown-workflow",
          message: `unknown workflow "${run.workflow}"`,
        };
  }
  const agents = context.nameableIds("agent", hub);
  if (agents.has(run.agent)) {
    return null;
  }
  const message = `unknown agent "${run.agent}"${didYouMean(run.agent, [...agents])}`;
  return { path: ["run", "agent"], code: "unknown-agent", message };
}

/**
 * Whether the root has agents or workflows of its own, so a root routine can run there. One that
 * failed its own checks counts: its errors say what to fix, and "need run.hub" would not.
 */
function rootHasWork(context: CheckContext): boolean {
  return context.hasReadKindIn("agent", null) || context.hasReadKindIn("workflow", null);
}

/** A mail trigger's connector is the hub's own or shared at the root, and is a Google one. */
function mailProblem(context: CheckContext, routine: Routine): RoutineProblem | null {
  const trigger = routine.value.trigger;
  if (!("mail" in trigger)) {
    return null;
  }
  const name = trigger.mail.connector;
  const hub = hubOf(routine) ?? null;
  const connector = [...context.filesOf("connector", hub), ...context.filesOf("connector", null)]
    .map((file) => file.value)
    .find((value) => value.id === name);
  const path = ["trigger", "mail", "connector"];
  if (connector === undefined) {
    return { path, code: "unknown-connector", message: `unknown connector "${name}"` };
  }
  if (!("google" in connector.transport)) {
    const message = `connector "${name}" is not a Google connector, so it has no mailbox to watch`;
    return { path, code: "not-a-mailbox", message };
  }
  return null;
}

/** A value of a trigger and the parser that checks it; it throws a `CronError`. */
interface TriggerPart {
  readonly path: FileProblem["path"];
  readonly text: string | undefined;
  readonly check: (text: string) => unknown;
}

/** The first part of the trigger that doesn't parse: its cron, time zone or interval. */
function triggerProblem(routine: Routine): RoutineProblem | null {
  for (const part of triggerParts(routine)) {
    if (part.text === undefined) {
      continue;
    }
    try {
      part.check(part.text);
    } catch (error) {
      if (error instanceof CronError) {
        return { path: part.path, code: "bad-trigger", message: error.message };
      }
      throw error;
    }
  }
  return null;
}

function triggerParts(routine: Routine): TriggerPart[] {
  const trigger = routine.value.trigger;
  if ("schedule" in trigger) {
    return [
      { path: ["trigger", "schedule"], text: trigger.schedule, check: parseCron },
      { path: ["trigger", "timezone"], text: trigger.timezone, check: checkTimeZone },
    ];
  }
  if ("every" in trigger) {
    return [{ path: ["trigger", "every"], text: trigger.every, check: parseEvery }];
  }
  if ("mail" in trigger) {
    return [{ path: ["trigger", "mail", "every"], text: trigger.mail.every, check: parseEvery }];
  }
  return [];
}
