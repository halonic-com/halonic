// The waiting line on a step that waits (microcopy 22 F3, failure-states W5, first-run-progress
// 3.3). After 2 seconds with no new event, the running step says what it waits for, read from the
// event the engine wrote before the wait. The engine's started events (`sandbox.started`,
// `harness.started`, `connector.started`) and the model and tool calls are the ones that name a
// wait.

import type { RunEvent } from "@halonicjs/events";
import { WAITING_LINE_AFTER_MS } from "@halonicjs/studio-kit";
import { failureWords } from "../failure-words.ts";
import { capitalised } from "../run-words.ts";
import { slowStepWords } from "../slow-step-words.ts";

/** How long a step stays quiet before it says what it waits for: the WaitingLine's 2 seconds. */
export const slowStepAfterMs = WAITING_LINE_AFTER_MS;

/** What the run waits for, and since when: the log's last event, when it names a wait. */
export interface StepWait {
  /** "Waiting for Claude", "Starting the sandbox". */
  readonly what: string;
  /** Why it can take long, only when Studio knows: a model on this computer. */
  readonly reason?: string;
  /** When the last event was written, which is when the wait began. */
  readonly since: Date;
}

/**
 * What the log's last event waits for, however long ago it was written, or `undefined` when it
 * names no wait. Only the last event counts, so a step that moved on never shows an old wait. On a
 * `phone`, a local model's line says it runs on the computer.
 */
export function stepWait(log: readonly RunEvent[], phone = false): StepWait | undefined {
  const last = log.at(-1);
  if (last === undefined) {
    return undefined;
  }
  const since = new Date(last.at);
  if (last.type === "llm.request" && last.provider === "ollama") {
    const what = phone ? slowStepWords.ollamaOnPhone : slowStepWords.ollama;
    return { what, reason: slowStepWords.ollamaReason, since };
  }
  const what = waitOf(last);
  return what === undefined ? undefined : { what, since };
}

function waitOf(last: RunEvent): string | undefined {
  switch (last.type) {
    case "llm.request":
      return slowStepWords.model(last.provider);
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

/**
 * What the running step waits for, once the log's last event is at least 2 seconds old, or
 * `undefined` while the step is quick or the last event names no wait.
 */
export function slowStepLine(
  log: readonly RunEvent[],
  now: Date,
  phone = false,
): string | undefined {
  const wait = stepWait(log, phone);
  if (wait === undefined || now.getTime() - wait.since.getTime() < slowStepAfterMs) {
    return undefined;
  }
  return wait.what;
}

/** When the line is due: the moment the last event turns 2 seconds old, `undefined` for an empty log. */
export function slowStepDueAt(log: readonly RunEvent[]): Date | undefined {
  const last = log.at(-1);
  return last === undefined ? undefined : new Date(Date.parse(last.at) + slowStepAfterMs);
}
