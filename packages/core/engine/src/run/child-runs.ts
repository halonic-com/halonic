// What the local executor reads to carry out a `workflow` state's effects:
// the start of a child run, how a child is now for its parent, and which run
// an event sent to a parent belongs to.

import type { BlobStore, RunStore } from "@halonicjs/ports";
import type { ChildRunNow, StartChildEffect, StartInput } from "../kernel/decide-types.ts";
import { definitionsOf, keepDefinitions } from "../kernel/kept-definitions.ts";
import type { RunState } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";
import { maxChildDepth } from "../states/workflow/state.ts";

/**
 * The start of the child run a parent's `workflow` state asked for: in the
 * parent's hub and of its kind, with the parent's kept definitions and the
 * child's workflow as the one it runs. The child keeps those definitions
 * as its own, so it never reads the workspace's files either. A parent that
 * runs all its task agents in one harness has its child do the same, and
 * the child records the version of the workspace its parent read.
 *
 * @param parent - the parent run as its step left it
 * @throws when the parent's definitions are missing or don't have the workflow
 */
export async function childStart(
  blobs: Pick<BlobStore, "get" | "put">,
  parent: RunState,
  effect: StartChildEffect,
  at: string,
): Promise<StartInput> {
  const definitions = await definitionsOf(blobs, parent.definitionsVersion);
  const workflows = definitions.workflows ?? {};
  const workflow = Object.hasOwn(workflows, effect.workflowId)
    ? workflows[effect.workflowId]
    : undefined;
  if (workflow === undefined) {
    throw new Error(
      `The definitions run "${parent.runId}" started with have no workflow "${effect.workflowId}".`,
    );
  }
  const definitionsVersion = await keepDefinitions(blobs, { ...definitions, workflow });
  return {
    type: "start",
    at,
    runId: effect.childRunId,
    hubId: parent.hubId,
    workflowId: effect.workflowId,
    input: effect.input,
    kind: parent.kind,
    definitionsVersion,
    parent: { runId: parent.runId, state: effect.state, depth: effect.depth },
    ...(parent.harness === null ? {} : { harness: parent.harness }),
    ...(parent.version === null ? {} : { version: parent.version }),
  };
}

/**
 * How a child run is now, as its parent hears it, read from the store when
 * the telling is carried out, so a late or repeated telling is up to date.
 *
 * @returns `null` when the child has no log
 */
export async function childNow(
  runs: Pick<RunStore, "events" | "snapshot" | "get">,
  childRunId: string,
): Promise<ChildRunNow | null> {
  const child = await readRun(runs, childRunId);
  if (child === null) return null;
  if (child.status === "running") return { status: "running" };
  if (child.status === "waiting") return { status: "waiting", events: child.accepts };
  if (child.status === "completed") return { status: "completed", context: child.context };
  if (child.status === "cant-try") return { status: "cant-try", cantTry: child.cantTry };
  const summary = await runs.get(childRunId);
  const error = summary?.error ?? `Run "${childRunId}" failed.`;
  const reason = summary?.reason ?? null;
  return { status: "failed", error, ...(reason === null ? {} : { reason }) };
}

/**
 * The run an event sent to `runId` belongs to: the run itself, or, while it
 * waits on a child that waits, that child, all the way down.
 */
export async function receiverOf(
  runs: Pick<RunStore, "events" | "snapshot">,
  runId: string,
): Promise<string> {
  let receiver = runId;
  for (let depth = 0; depth < maxChildDepth; depth += 1) {
    const run = await readRun(runs, receiver);
    if (run === null || run.status !== "waiting" || run.child === null) break;
    receiver = run.child.runId;
  }
  return receiver;
}

/** The `error` of a child run that was going on when the run that started it ended. */
export const parentEndedError = "The run that started this one ended, so this one was cancelled.";

/**
 * Ends the child runs a run started and hasn't heard end, all the way down,
 * each before its own children: the one a `workflow` state waits on, and
 * those a `foreach` state's items run. They are read from the log, because
 * the run's state forgets them once the run has ended.
 *
 * @param end - ends one child run
 */
export async function endChildrenOf(
  runs: Pick<RunStore, "events">,
  runId: string,
  end: (childRunId: string) => Promise<void>,
): Promise<void> {
  const going = new Set<string>();
  // From 0, as every read of the engine's names its position.
  for (const event of await runs.events(runId, 0)) {
    if (event.type === "workflow.started") going.add(event.childRunId);
    if (event.type === "workflow.finished") going.delete(event.childRunId);
  }
  for (const childRunId of going) {
    await end(childRunId);
    await endChildrenOf(runs, childRunId, end);
  }
}
