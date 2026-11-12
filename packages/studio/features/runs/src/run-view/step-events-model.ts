// An entry's events in the side panel (checklist part 1, 1.10; design-runs
// 3, Every step): the step's model calls with their model and tokens, and
// its tool calls with their arguments. The panel only draws what this
// returns.

import { shortRunId } from "@halonicjs/app";
import { blockedSites, type RunEvent, type StepBlockedSites } from "@halonicjs/events";
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
      toolCalls.push({
        id: event.seq,
        tool: escapeHidden(event.tool),
        args: escapeHidden(JSON.stringify(event.args ?? {}, null, 2)),
      });
    }
  }
  return { modelCalls, toolCalls };
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
function eventsOfStep(events: readonly RunEvent[], entryId: string): RunEvent[] {
  const index = Number(entryId.slice("step-".length));
  let step = -1;
  return events.filter((event) => {
    if (event.type === "state.entered" && event.branch === undefined && event.item === undefined) {
      step += 1;
    }
    return step === index;
  });
}
