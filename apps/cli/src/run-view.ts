// What a run did, as `halonic runs show` prints it and a finished
// `halonic run` ends (cli-output 3.4): one line per step the run reached,
// and the receipt. Both are worked out from the run log alone, so the two
// commands say the same about a run. Only the facts are decided here; the
// words are the catalogue's (`runMessages`, `runsMessages`), so this file
// holds no text.

import { shortRunId, type WorkflowDefinition } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { KindValues } from "@halonicjs/format";
import { columns } from "./messages/columns.ts";
import { duration } from "./messages/duration.ts";
import type { Phrase } from "./messages/phrase.ts";
import { type RunReceipt, runMessages } from "./messages/run.ts";
import { runsMessages } from "./messages/runs.ts";
import { runsListMessages, startedInWords } from "./messages/runs-list.ts";
import { stepName } from "./messages/step-name.ts";
import type { Mark } from "./output/paint.ts";
import { type RunStep, runSteps } from "./run-steps.ts";
import { dueAt, type RunClock, startedAt } from "./run-times.ts";

/** An agent as the workspace defines it. */
export type AgentDefinition = KindValues["agent"];

/** The workspace's definitions a run's steps are named by. */
export interface RunDefinitions {
  /** The run's workflow; `undefined` when it's no longer in the workspace. */
  readonly workflow: WorkflowDefinition | undefined;
  /** The agent with this id in the run's hub; `undefined` when it's gone. */
  readonly agent: (agentId: string) => AgentDefinition | undefined;
}

/**
 * The step lines, lined up in columns: the mark and the step's name, what
 * ran it ("Writer · smart"), then how long it took. A wait step says what
 * the user answered instead of a time; the step that's running or waiting
 * says since when. Steps the run didn't reach get no line, and neither does
 * the end state the run finished in (see `runSteps`).
 *
 * @example
 * stepLines(events, summary, definitions, { now: new Date() }).map(plainText);
 * // ["✓ Read the email   Writer · smart   1 s",
 * //  "! Approve this reply?   you approved at 14:02"]
 */
export function stepLines(
  events: readonly RunEvent[],
  summary: RunSummary,
  definitions: RunDefinitions,
  clock: RunClock,
): Phrase[] {
  const rows = runSteps(events, summary).map((step) => stepRow(step, definitions, clock));
  return columns(rows);
}

/**
 * The receipt of a run (cli-output 3.4): what it changed, sent, asked and
 * cost. "Sent nothing" only when the run made no tool call: the log doesn't
 * yet say what a tool sent, so a run with tool calls leaves the part out
 * rather than guess (revision 32), as the `runs` list does. The cost is left
 * out when no call had a price, such as a run on the test model.
 *
 * @example
 * receiptOf(events, summary);
 * // { changedFiles: 0, sent: [], askedYou: 1, estimatedCost: 0.004 }
 */
export function receiptOf(events: readonly RunEvent[], summary: RunSummary): RunReceipt {
  const madeToolCalls = events.some((event) => event.type === "tool.called");
  return {
    // No event says which workspace files a run changed yet.
    changedFiles: 0,
    ...(madeToolCalls ? {} : { sent: [] }),
    askedYou: events.filter(askedTheUser).length,
    ...(summary.cost > 0 ? { estimatedCost: summary.cost } : {}),
  };
}

/**
 * A time the run waited for the user: at a wait step, or for their OK on a
 * tool call, which the engine logs as a wait for approve or reject too.
 */
function askedTheUser(event: RunEvent): boolean {
  return event.type === "run.waiting" && event.child === undefined && event.events.length > 0;
}

/** The cells of one step's line. */
function stepRow(step: RunStep, definitions: RunDefinitions, clock: RunClock): Phrase[] {
  const state = definitions.workflow?.states[step.stateId];
  const name = runsMessages.step(markOf(step), stepName(step.stateId, state?.description)).phrase;
  const facts = agentFacts(step, definitions);
  const at = (iso: string) => startedInWords(startedAt(new Date(iso), clock));
  const { end } = step;
  switch (end.kind) {
    case "done":
    case "failed":
      return [name, runMessages.stepFacts(facts).phrase, [duration(end.tookMs)]];
    case "answered":
      return [name, runsMessages.youAnswered(end.event, startedAt(new Date(end.at), clock)).phrase];
    case "waitingForYou":
      return [name, runsMessages.waitingSince(at(end.since)).phrase];
    case "waitingUntil":
      return [name, runsListMessages.waitingUntil(dueAt(new Date(end.due), clock)).phrase];
    case "waitingForChildRun":
      return [name, runsListMessages.waitingForChildRun(shortRunId(end.childRunId)).phrase];
    case "waitingForApproval":
      // A parallel step has no agent of its own, and so nothing after its name.
      return facts.length === 0 ? [name] : [name, runMessages.stepFacts(facts).phrase];
    case "running":
      return [name, runsMessages.runningSince(facts, at(end.since)).phrase];
  }
}

/** ✓ done, ✕ failed, ! for every step that asked the user, ◌ for one still going. */
function markOf(step: RunStep): Mark {
  switch (step.end.kind) {
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "answered":
    case "waitingForYou":
    case "waitingForApproval":
      return "needsYou";
    case "waitingUntil":
    case "waitingForChildRun":
    case "running":
      return "working";
  }
}

/**
 * What ran the step: its agent's name and model alias, "Writer · smart".
 * The alias is the method's own when the step calls one. An agent that's no
 * longer in the workspace is named by its id; a step without an agent has
 * no facts.
 */
function agentFacts(step: RunStep, definitions: RunDefinitions): string[] {
  if (step.agentId === undefined) {
    return [];
  }
  const agent = definitions.agent(step.agentId);
  if (agent === undefined) {
    return [step.agentId];
  }
  const method = definitions.workflow?.states[step.stateId]?.method;
  const model = (method === undefined ? undefined : agent.methods[method]?.model) ?? agent.model;
  return model === undefined ? [agent.name] : [agent.name, model];
}
