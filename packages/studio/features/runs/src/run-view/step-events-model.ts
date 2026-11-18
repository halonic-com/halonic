// An entry's events in the side panel (checklist part 1, 1.10; design-runs
// 3, Every step): the step's model calls with their model and tokens, and
// its tool calls with their arguments. The panel only draws what this
// returns. A tool call that failed gets a quiet "✕ Didn't work" line
// (HAL-12415, option a; microcopy 1.6, E1).

import { shortRunId } from "@halonicjs/app";
import { blockedSites, entryOf, type RunEvent, type StepBlockedSites } from "@halonicjs/events";
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
  /** The `seq` of its `tool.called`. */
  readonly id: number;
  /** The tool's name as the model wrote it, "send_email". */
  readonly tool: string;
  /** Its arguments as indented JSON, folded until the person opens them. */
  readonly args: string;
  /** How it failed, for the line under it; absent for a call that worked or has no result yet. */
  readonly failed?: FailedCall;
}

/**
 * A tool call whose `tool.result` has the outcome `error` or `unknown`. Only
 * typed fields of the log fill it: the result's text is the engine's or the
 * tool's own words, which a screen never shows (microcopy 1.6, E3).
 */
export interface FailedCall {
  /**
   * Why, when the log says: `no-answer` when the call broke off without an
   * answer (outcome `unknown`), so it may or may not have done its work.
   * Absent for `error`, whose reason is only in the result's text.
   */
  readonly reason?: "no-answer";
  /** The connector the tool came from, "notes-mcp", when the log names it right before the call. */
  readonly connector?: string;
}

/** What a step's entry shows in the side panel. */
export interface StepEvents {
  readonly modelCalls: readonly ModelCall[];
  readonly toolCalls: readonly ToolCall[];
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
  const modelCalls: ModelCall[] = [];
  const toolCalls: ToolCall[] = [];
  const failures = failedCalls(events);
  for (const event of eventsOfStep(events, entryId)) {
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
      const failed = failures.get(event.seq);
      toolCalls.push({
        id: event.seq,
        tool: escapeHidden(event.tool),
        args: escapeHidden(JSON.stringify(event.args ?? {}, null, 2)),
        ...(failed === undefined ? {} : { failed }),
      });
    }
  }
  return { modelCalls, toolCalls };
}

/**
 * The tool calls of the whole log that failed, by the `seq` of their
 * `tool.called`. A `tool.result` finds its call the way the timeline does
 * (`entryOf`); a result from an older log, without `outcome`, counts as
 * one that worked.
 */
function failedCalls(events: readonly RunEvent[]): Map<number, FailedCall> {
  const entries = entryOf(events);
  const indexBySeq = new Map(events.map((event, index) => [event.seq, index]));
  const failures = new Map<number, FailedCall>();
  events.forEach((event, index) => {
    if (event.type !== "tool.result") return;
    if (event.outcome !== "error" && event.outcome !== "unknown") return;
    const calledIndex = indexBySeq.get(entries[index] ?? event.seq);
    if (calledIndex === undefined) return;
    const called = events[calledIndex];
    if (called?.type !== "tool.called") return;
    const connector = connectorBefore(events[calledIndex - 1], called.tool);
    failures.set(called.seq, {
      ...(event.outcome === "unknown" ? { reason: "no-answer" as const } : {}),
      ...(connector === undefined ? {} : { connector: escapeHidden(connector) }),
    });
  });
  return failures;
}

/**
 * The connector of a call to `tool`, from the event the engine logs right
 * before its `tool.called`: `connector.started` for a call that can change
 * things, `tool.unasked` for one the connector's `read` list lets through.
 * Other calls don't say which connector they went to.
 */
function connectorBefore(before: RunEvent | undefined, tool: string): string | undefined {
  if (before?.type === "connector.started") return before.connector;
  if (before?.type === "tool.unasked" && before.tool === tool) return before.connector;
  return undefined;
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

/**
 * The events of every step, in one pass over the log: the one at index 1
 * is `eventsOfStep(events, "step-1")`. Events before the first step are left out.
 */
export function eventsBySteps(events: readonly RunEvent[]): RunEvent[][] {
  const steps: RunEvent[][] = [];
  for (const event of events) {
    if (event.type === "state.entered" && event.branch === undefined && event.item === undefined) {
      steps.push([]);
    }
    steps[steps.length - 1]?.push(event);
  }
  return steps;
}
