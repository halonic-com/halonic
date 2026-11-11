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

/**
 * The run and the child runs it waits on, all the way down, the run first:
 * the runs a cancel of `runId` ends. A run with no log gives none.
 */
export async function runAndChildren(
  runs: Pick<RunStore, "events" | "snapshot">,
  runId: string,
): Promise<string[]> {
  const chain: string[] = [];
  let next: string | undefined = runId;
  while (next !== undefined && chain.length <= maxChildDepth) {
    const run = await readRun(runs, next);
    if (run === null) break;
    chain.push(next);
    next = run.child?.runId;
  }
  return chain;
}
