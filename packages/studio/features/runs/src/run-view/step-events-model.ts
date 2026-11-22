// An entry's events in the side panel (checklist part 1, 1.10; design-runs
// 3, Every step): the step's model calls with their model and tokens, and
// its tool calls with their arguments. The panel only draws what this
// returns. A tool call that failed gets a quiet "✕ Didn't work" line
// (HAL-12415, option a; microcopy 1.6, E1), with its cause when the engine
// logged one (HAL-12471). A call a person approved whose connector then
// didn't start, and a connector that couldn't list its tools, show too
// (HAL-15009).

import { eventsBySteps, shortRunId } from "@halonicjs/app";
import {
  type ConnectorStartCause,
  escapedCause,
  type FailedCall,
  failedToolCalls,
} from "@halonicjs/app/failed-call";
import {
  blockedSites,
  type RunEvent,
  type StepBlockedSites,
  toolFailureCauseOf,
} from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import { runPageWords, stepEventsWords, stepName } from "../run-words.ts";
import { entrySiteLimit } from "./blocked-sites.tsx";

/** One model call of a step. */
export interface ModelCall {
  /** The `seq` of its `llm.response`. */
  readonly id: number;
  /** The model that answered, "claude-sonnet". */
  readonly model: string;
  /** "1,204 in · 312 out", or "cached, no model call". */
  readonly tokens: string;
}

/** One tool call of a step. */
export interface ToolCall {
  /**
   * The `seq` of its `tool.called`, or of its `approval.requested` for a
   * call a person approved that was never made (`failedToolCalls`).
   */
  readonly id: number;
  /** The tool's name as the model wrote it, "send_email". */
  readonly tool: string;
  /** Its arguments as indented JSON, folded until the person opens them. */
  readonly args: string;
  /** How it failed, for the line under it; absent for a call that worked or has no result yet. */
  readonly failed?: FailedCall;
}

export type { ConnectorStartCause, FailedCall };

/** A connector that couldn't list its tools when one of the step's model turns started. */
export interface ConnectorNotStarted {
  /** The `seq` of the step's first `connector.listing-failed` for it. */
  readonly id: number;
  /** Its id in the workspace, "notes". */
  readonly connector: string;
  /** Why, with a program's or a secret's `name` escaped. */
  readonly cause: ConnectorStartCause;
}

/** What a step's entry shows in the side panel. */
export interface StepEvents {
  readonly modelCalls: readonly ModelCall[];
  readonly toolCalls: readonly ToolCall[];
  /**
   * The connectors whose tools the step's turns went without, once each,
   * for a quiet line above its tool calls; one a tool call's own line
   * already says didn't start is left out.
   */
  readonly connectorsNotStarted: readonly ConnectorNotStarted[];
}

/**
 * The calls of the step whose entry is `entryId` ("step-1", from
 * `everyStep`), a parallel branch's or a for-each item's among them. Every
 * value from the log is plain text, with hidden and direction-changing
 * characters escaped.
 *
 * @example
 * stepEvents(events, "step-1");
 * // { modelCalls: [{ id: 5, model: "claude-sonnet", tokens: "1,204 in · 312 out" }],
 * //   toolCalls: [{ id: 6, tool: "send_email", args: '{\n  "to": "sam@acme.example"\n}' }] }
 */
export function stepEvents(events: readonly RunEvent[], entryId: string): StepEvents {
  const stepLog = eventsOfStep(events, entryId);
  const modelCalls: ModelCall[] = [];
  const calledTools: ToolCall[] = [];
  const failures = new Map(failedToolCalls(events, stepLog).map((call) => [call.id, call]));
  for (const event of stepLog) {
    if (event.type === "llm.response") {
      modelCalls.push({
        id: event.seq,
        model: escapeHidden(event.model),
        tokens:
          event.cached === true
            ? stepEventsWords.cached
            : stepEventsWords.tokens(event.usage.inputTokens, event.usage.outputTokens),
      });
    } else if (event.type === "tool.called") {
      const failed = failures.get(event.seq)?.failed;
      failures.delete(event.seq);
      calledTools.push({
        id: event.seq,
        tool: escapeHidden(event.tool),
        args: argsText(event.args),
        ...(failed === undefined ? {} : { failed }),
      });
    }
  }
  // The failures left are calls a person approved whose connector then didn't start: listed by
  // their approval, in the order they were asked for.
  const approvedNotMade = [...failures.values()].map(({ id, tool, args, failed }) => ({
    id,
    tool,
    args: argsText(args),
    failed,
  }));
  const toolCalls = [...calledTools, ...approvedNotMade].sort(
    (first, second) => first.id - second.id,
  );
  return { modelCalls, toolCalls, connectorsNotStarted: connectorsNotStarted(stepLog, toolCalls) };
}

/** A call's arguments as indented JSON, escaped. */
function argsText(args: unknown): string {
  return escapeHidden(JSON.stringify(args ?? {}, null, 2));
}

/**
 * The connectors among `stepLog` that couldn't list their tools when a
 * turn started (`connector.listing-failed`), once each, in the order they
 * first failed. A connector that a line under one of `toolCalls` already
 * says didn't start is left out, so the panel doesn't say it twice.
 */
function connectorsNotStarted(
  stepLog: readonly RunEvent[],
  toolCalls: readonly ToolCall[],
): ConnectorNotStarted[] {
  const saidUnderACall = new Set(
    toolCalls.flatMap(({ failed }) =>
      failed?.cause?.code === "connector-not-started" && failed.connector !== undefined
        ? [failed.connector]
        : [],
    ),
  );
  const byConnector = new Map<string, ConnectorNotStarted>();
  for (const event of stepLog) {
    if (event.type !== "connector.listing-failed") continue;
    const connector = escapeHidden(event.connector);
    if (byConnector.has(connector) || saidUnderACall.has(connector)) continue;
    byConnector.set(connector, { id: event.seq, connector, cause: listingCauseOf(event) });
  }
  return [...byConnector.values()];
}

/**
 * The cause of a `connector.listing-failed`, read as the same cause on a
 * `tool.result` is (`toolFailureCauseOf`), since the log is read from a
 * file; one it can't read says only that the connector didn't start.
 */
function listingCauseOf(
  event: Extract<RunEvent, { type: "connector.listing-failed" }>,
): ConnectorStartCause {
  const cause = toolFailureCauseOf({
    type: "tool.result",
    agent: event.agent,
    tool: "",
    result: "",
    cause: event.cause,
  });
  return cause?.code === "connector-not-started"
    ? escapedCause(cause)
    : { code: "connector-not-started", why: "other" };
}

/** The sites one agent's sandbox refused in a step, with the agent's name. */
export interface AgentBlockedSites {
  /** The sites, at most {@link entrySiteLimit}, most tries first. */
  readonly sites: StepBlockedSites;
  /**
   * The agent as the person sees it: its id with the first letter made a
   * capital, "Writer", the way a step without a description is named, until
   * the panel can read the agent's own name.
   */
  readonly agent: string;
}

/**
 * The sites the sandbox refused in the step whose entry is `entryId`, for
 * the Blocked sites part at the top of its panel (`runs.run-view.blocked-sites`).
 * A step usually has one; a parallel branch or a for-each item that was
 * refused sites has its own. Empty for a step with no blocked site.
 *
 * @example
 * stepBlockedSites(events, "step-1");
 * // [{ agent: "Writer", sites: { state: "install", sites: [{ host: "registry.npmjs.org", tries: 12 }], … } }]
 */
export function stepBlockedSites(
  events: readonly RunEvent[],
  entryId: string,
): AgentBlockedSites[] {
  const inStep = new Set(eventsOfStep(events, entryId).map((event) => event.seq));
  return blockedSites(events, { limit: entrySiteLimit })
    .filter((sites) => inStep.has(sites.firstSeq))
    .map((sites) => ({ sites, agent: stepName(sites.agent, undefined) }));
}

/** A child run the step started, for "Started Verify → Run 7k2m9p". */
export interface ChildRun {
  /** The child's full id, to open its page. */
  readonly runId: string;
  /** "Started Verify". */
  readonly started: string;
  /** The link's words, "Run 7k2m9p". */
  readonly link: string;
}

/**
 * The child runs the step whose entry is `entryId` started, in the order it
 * started them: one for a workflow step, one for each item of a for-each
 * over a workflow. `workflowName` names what a child ran, from its id.
 *
 * @example
 * stepChildRuns(events, "step-2", (id) => (id === "verify" ? "Verify" : id));
 * // [{ runId: "run_a_01jd8q.4.0", started: "Started Verify", link: "Run 4.0" }]
 */
export function stepChildRuns(
  events: readonly RunEvent[],
  entryId: string,
  workflowName: (workflowId: string) => string,
): ChildRun[] {
  return eventsOfStep(events, entryId).flatMap((event) =>
    event.type === "workflow.started"
      ? [
          {
            runId: event.childRunId,
            started: stepEventsWords.startedChild(escapeHidden(workflowName(event.workflow))),
            link: runPageWords.title(shortRunId(event.childRunId)),
          },
        ]
      : [],
  );
}

/**
 * The events of the step whose entry is `entryId` ("step-1", from
 * `everyStep`). Steps start where `runSteps` starts them: at each
 * `state.entered` of the workflow itself, so a parallel branch's or a
 * for-each item's events belong to their step.
 */
export function eventsOfStep(events: readonly RunEvent[], entryId: string): RunEvent[] {
  return eventsBySteps(events)[Number(entryId.slice("step-".length))] ?? [];
}
