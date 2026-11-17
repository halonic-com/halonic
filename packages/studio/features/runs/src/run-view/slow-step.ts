// The quiet line on a step that waits (microcopy 22 F3, failure-states W5). After 10 seconds with
// no new event, the running step says what it waits for, read from the event the engine wrote
// before the wait. The engine's started events (`sandbox.started`, `harness.started`,
// `connector.started`) and the model and tool calls are the ones that name a wait.

import type { RunEvent } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { capitalised } from "../run-words.ts";
import { slowStepWords } from "../slow-step-words.ts";

/** How long a step stays quiet before it says what it waits for. */
export const slowStepAfterMs = 10_000;

/**
 * What the running step waits for, once the log's last event is at least 10 seconds old, or
 * `undefined` while the step is quick or the last event names no wait. Only the last event
 * counts, so a step that moved on never shows an old wait.
 */
export function slowStepLine(log: readonly RunEvent[], now: Date): string | undefined {
  const last = log.at(-1);
  if (last === undefined || now.getTime() - Date.parse(last.at) < slowStepAfterMs) {
    return undefined;
  }
  switch (last.type) {
    case "llm.request":
      return last.provider === "ollama" ? slowStepWords.ollama : slowStepWords.model(last.provider);
    case "tool.called":
      return slowStepWords.tool(last.tool);
    case "connector.started":
      return slowStepWords.connector(last.connector);
    case "harness.started":
      return slowStepWords.harness(
        failureWords.harnessNames[last.harness] ?? capitalised(last.harness),
      );
    case "sandbox.started":
      return slowStepWords.sandbox;
    default:
      return undefined;
  }
}

/** When the line is due: the moment the last event turns 10 seconds old, `undefined` for an empty log. */
export function slowStepDueAt(log: readonly RunEvent[]): Date | undefined {
  const last = log.at(-1);
  return last === undefined ? undefined : new Date(Date.parse(last.at) + slowStepAfterMs);
}
