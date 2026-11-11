// What a run did, as `halonic runs show` prints it and a finished
// `halonic run` ends (cli-output 3.4): one line per step the run reached,
// and the receipt. Both are worked out from the run log alone, so the two
// commands say the same about a run. Only the facts are decided here; the
// words are the catalogue's (`runMessages`, `runsMessages`), so this file
// holds no text.

import { hubWorkflows, shortRunId, type WorkflowDefinition, workflowIn } from "@halonicjs/app";
import { type RunEvent, type RunSummary, sendsOf } from "@halonicjs/events";
import type { KindValues } from "@halonicjs/format";
import { definitionsOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { columns, columnsAs, columnWidths, paddingAfter } from "./messages/columns.ts";
import { duration } from "./messages/duration.ts";
import { type Phrase, phrase } from "./messages/phrase.ts";
import { type RunReceipt, runMessages } from "./messages/run.ts";
import { runsMessages } from "./messages/runs.ts";
import { runsListMessages, startedInWords } from "./messages/runs-list.ts";
import { stepName } from "./messages/step-name.ts";
import type { Mark } from "./output/paint.ts";
import { printable } from "./output/printable.ts";
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
  /** The model alias an agent without its own runs on: the hub's default, else the workspace's. */
  readonly defaultModel?: string;
}

/**
 * The definitions the run's steps are named by, from its own hub. A hub
 * that's no longer in the workspace leaves the workflow and its agents
 * unknown, so the steps are named by their ids.
 */
export function runViewDefinitions(loaded: LoadedWorkspace, summary: RunSummary): RunDefinitions {
  const workflow = workflowIn(hubWorkflows(loaded), summary.hubId, summary.workflowId);
  if (workflow === undefined) {
    return { workflow, agent: () => undefined };
  }
  const { agents, defaultModel } = definitionsOf(loaded, summary.hubId);
  return {
    workflow,
    agent: (agentId) => (Object.hasOwn(agents, agentId) ? agents[agentId] : undefined),
    ...(defaultModel === undefined ? {} : { defaultModel }),
  };
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
  widths?: StepColumns,
): Phrase[] {
  const rows = runSteps(events, summary).map((step) => stepRow(step, definitions, clock));
  return widths === undefined ? columns(rows) : columnsAs(rows, widths.rows);
}

/**
 * Column widths for step lines that don't depend on which steps ran, so
 * a line printed while the run goes never needs widening (cli-output 3.4,
 * "Live, in a terminal"). They come from the workflow's definition: each
 * step's name with the widest mark, and what runs it, "Writer · smart".
 * An end of the workflow is not a step, so it doesn't count.
 */
export interface StepColumns {
  /** One row per step of the workflow, for {@link columnsAs}; never printed. */
  readonly rows: readonly (readonly Phrase[])[];
}

/** The {@link StepColumns} of the run's workflow; none when the workflow is gone. */
export function stepColumns(definitions: RunDefinitions): StepColumns {
  const states = Object.entries(definitions.workflow?.states ?? {});
  const rows = states
    .filter(([, state]) => state.type !== "final")
    .map(([stateId, state]) => {
      // ✓ is the widest mark with and without UTF-8 ("ok"), as wide as ◌ ("..").
      const name = runsMessages.step("done", stepName(stateId, state.description)).phrase;
      const facts = agentFacts(stateId, state.agent, definitions);
      return facts.length === 0 ? [name] : [name, runMessages.stepFacts(facts).phrase];
    });
  return { rows };
}

/**
 * What the live ◌ line of a step says after the mark: its name, padded to
 * the step column, then what runs it, as its ✓ line will (cli-output 3.4):
 * "Draft a reply    Writer · smart". The agent comes from the definition,
 * since the step's line is drawn before its agent starts.
 */
export function stepDoing(
  stateId: string,
  definitions: RunDefinitions,
  widths: StepColumns,
): Phrase {
  const state = definitions.workflow?.states[stateId];
  const name = stepName(stateId, state?.description);
  const facts = agentFacts(stateId, state?.agent, definitions);
  if (facts.length === 0) {
    return [name];
  }
  // Padded as the whole cell "◌ Draft a reply" is, so the facts line up with the ✓ lines.
  const cell = runsMessages.step("working", name).phrase;
  const [nameWidth] = columnWidths(widths.rows);
  return phrase`${name}${paddingAfter(cell, nameWidth)}${runMessages.stepFacts(facts).phrase}`;
}

/**
 * The receipt of a run (cli-output 3.4): what it changed, sent, asked and
 * cost. What it sent comes from `sendsOf`, as the `runs` list's does, so the
 * two say the same about a run. The cost is left out when no call had a
 * price, such as a run on the test model.
 *
 * @example
 * receiptOf(events, summary);
 * // { changedFiles: 0, sends: { sent: [], maySend: [], madeToolCalls: false }, askedYou: 1, estimatedCost: 0.004 }
 */
export function receiptOf(events: readonly RunEvent[], summary: RunSummary): RunReceipt {
  return {
    // No event says which workspace files a run changed yet.
    changedFiles: 0,
    sends: sendsOf(events),
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
  const facts = agentFacts(step.stateId, step.agentId, definitions);
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
      if (facts.length === 0) return [name];
      return end.subagent === undefined
        ? [name, runMessages.stepFacts(facts).phrase]
        : [name, runMessages.subagentStepFacts(agentName(end.subagent, definitions), facts).phrase];
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

/** An agent's name, or its id when it's no longer in the workspace, made printable. */
function agentName(agentId: string, definitions: RunDefinitions): string {
  return printable(definitions.agent(agentId)?.name ?? agentId);
}

/**
 * What ran the step: its agent's name and model alias, "Writer · smart".
 * The alias is the method's own when the step calls one, else the agent's,
 * else the default of its hub or workspace, as the engine picks it. With no
 * alias at all the line names only the agent. An agent that's no longer in
 * the workspace is named by its id; a step without an agent has no facts.
 * All of it comes from workspace files, so it is made printable (cli-output
 * section 5).
 */
function agentFacts(
  stateId: string,
  agentId: string | undefined,
  definitions: RunDefinitions,
): string[] {
  if (agentId === undefined) {
    return [];
  }
  const agent = definitions.agent(agentId);
  if (agent === undefined) {
    return [printable(agentId)];
  }
  const method = definitions.workflow?.states[stateId]?.method;
  const model =
    (method === undefined ? undefined : agent.methods[method]?.model) ??
    agent.model ??
    definitions.defaultModel;
  const facts = model === undefined ? [agent.name] : [agent.name, model];
  return facts.map(printable);
}
