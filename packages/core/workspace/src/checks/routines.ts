import type { FileProblem } from "@halonicjs/format";
import { CronError, checkTimeZone, parseCron, parseEvery } from "@halonicjs/routines";
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
 * intervals. Each message is the old loader's, after `Routine "<id>": `.
 *
 * A routine in a hub runs that hub's workflows and agents. One at the root
 * names its hub in `run.hub`, unless the root has agents or workflows of its
 * own. A routine in a hub whose `hub.yaml` failed isn't checked: the old
 * loader left that hub out.
 */
export function checkRoutines(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const routine of context.filesOf("routine")) {
    if (context.hubFailed(routine.hub)) {
      continue;
    }
    const problems = [
      targetProblem(context, routine),
      mailProblem(context, routine),
      triggerProblem(routine),
    ];
    for (const problem of problems) {
      if (problem !== null) {
        const message = `Routine "${routine.value.id}": ${problem.message}`;
        issues.push(context.error(routine.path, problem.path, problem.code, message));
      }
    }
  }
  return issues;
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
    hub = null;
  } else if (routine.hub === null && hub !== null && context.filesOf("hub", hub).length === 0) {
    return { path: ["run", "hub"], code: "unknown-hub", message: `unknown hub "${hub}"` };
  }
  if ("workflow" in run) {
    return context.idsOf("workflow", hub).has(run.workflow)
      ? null
      : {
          path: ["run", "workflow"],
          code: "unknown-workflow",
          message: `unknown workflow "${run.workflow}"`,
        };
  }
  return context.idsOf("agent", hub).has(run.agent)
    ? null
    : { path: ["run", "agent"], code: "unknown-agent", message: `unknown agent "${run.agent}"` };
}

/** Whether the root has agents or workflows of its own, so a root routine can run there. */
function rootHasWork(context: CheckContext): boolean {
  return context.filesOf("agent", null).length > 0 || context.filesOf("workflow", null).length > 0;
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
