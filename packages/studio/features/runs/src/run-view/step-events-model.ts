// An entry's events in the side panel (checklist part 1, 1.10; design-runs
// 3, Every step): the step's model calls with their model and tokens, and
// its tool calls with their arguments. The panel only draws what this
// returns.

import type { RunEvent } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import { stepEventsWords } from "../run-words.ts";

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
 * The events of the step whose entry is `entryId` ("step-1", from
 * `everyStep`). Steps start where `runSteps` starts them: at each
 * `state.entered` of the workflow itself, so a parallel branch's or a
 * for-each item's calls belong to their step. Every value from the log is
 * plain text, with hidden and direction-changing characters escaped.
 *
 * @example
 * stepEvents(events, "step-1");
 * // { modelCalls: [{ id: 5, model: "claude-sonnet", tokens: "1,204 in · 312 out" }],
 * //   toolCalls: [{ id: 6, tool: "send_email", args: '{\n  "to": "sam@acme.example"\n}' }] }
 */
export function stepEvents(events: readonly RunEvent[], entryId: string): StepEvents {
  const index = Number(entryId.slice("step-".length));
  const modelCalls: ModelCall[] = [];
  const toolCalls: ToolCall[] = [];
  let step = -1;
  for (const event of events) {
    if (event.type === "state.entered" && event.branch === undefined && event.item === undefined) {
      step += 1;
    }
    if (step !== index) {
      continue;
    }
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
