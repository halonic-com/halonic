// What `--debug` adds under a failed run's lines (HAL-6613): what the run
// log holds about the failure, for an engineer or a bug report. The two
// lines stay the user's; these quote the log as it is: the engine's own
// error, the provider's own text (requirement `events.provider-text`, kept
// for `--debug`) and the model calls of the step the run failed in. The
// printer removes every loaded secret from the whole text before it splits
// it into lines, as it does for an error's `--debug` text.

import type { ProviderText, RunEvent } from "@halonicjs/events";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { runFailedDebugMessages } from "./messages/run-failures.ts";
import type { RunFailedEvent } from "./run-failure-of.ts";

/** One model call line, before repeats of the same call are counted. */
type ModelCall = Extract<RunEvent, { type: "llm.request" | "llm.fallback" | "llm.skipped" }>;

/**
 * The failure's details as one text: the engine's error, the provider's
 * text when the log has it, then the model calls of the failed step, each
 * indented under its heading.
 *
 * @example
 * runFailureDetails(events, failed);
 * // "The engine said: model call failed\n
 * //  The provider said (HTTP 400): max_tokens is too large\n
 * //  Model calls in this step:\n
 * //    writer called claude-sonnet-5-5 at anthropic"
 */
export function runFailureDetails(events: readonly RunEvent[], failed: RunFailedEvent): string {
  const lines: string[] = [];
  if (failed.error.trim() !== "") {
    lines.push(text(runFailedDebugMessages.engineSaid(failed.error)));
  }
  if (failed.providerText !== undefined) {
    lines.push(providerSaid(failed.providerText));
  }
  const calls = modelCallLines(callsOfLastStep(events));
  if (calls.length === 0) {
    lines.push(text(runFailedDebugMessages.noModelCalls()));
  } else {
    lines.push(text(runFailedDebugMessages.modelCalls()), ...calls.map((line) => `  ${line}`));
  }
  return lines.join("\n");
}

/** The model calls after the last step the run entered, the one it failed in. */
function callsOfLastStep(events: readonly RunEvent[]): ModelCall[] {
  const entered = events.findLastIndex((event) => event.type === "state.entered");
  return events.slice(entered + 1).filter(isModelCall);
}

function isModelCall(event: RunEvent): event is ModelCall {
  return (
    event.type === "llm.request" || event.type === "llm.fallback" || event.type === "llm.skipped"
  );
}

/**
 * One line per call, in the log's order. The same request made again
 * straight after, as each turn of an agent is, is one line with a count;
 * a move to another model has the provider's text under it.
 */
function modelCallLines(calls: readonly ModelCall[]): string[] {
  const lines: string[] = [];
  let index = 0;
  while (index < calls.length) {
    const call = calls[index] as ModelCall;
    if (call.type === "llm.request") {
      const times = repeatsFrom(calls, index);
      lines.push(text(runFailedDebugMessages.called(call.agent, call.model, call.provider, times)));
      index += times;
      continue;
    }
    if (call.type === "llm.fallback") {
      lines.push(text(runFailedDebugMessages.movedOn(call.agent, call.from, call.to, call.error)));
      if (call.providerText !== undefined) {
        lines.push(`  ${providerSaid(call.providerText)}`);
      }
    } else {
      lines.push(
        text(runFailedDebugMessages.skipped(call.agent, call.alias, call.reason, call.next)),
      );
    }
    index += 1;
  }
  return lines;
}

/** How many requests in a row, from `start`, call the same model for the same agent. */
function repeatsFrom(calls: readonly ModelCall[], start: number): number {
  const first = calls[start];
  let end = start + 1;
  while (end < calls.length && sameRequest(first, calls[end])) {
    end += 1;
  }
  return end - start;
}

function sameRequest(one: ModelCall | undefined, other: ModelCall | undefined): boolean {
  return (
    one?.type === "llm.request" &&
    other?.type === "llm.request" &&
    one.agent === other.agent &&
    one.provider === other.provider &&
    one.model === other.model
  );
}

function providerSaid({ text: said, status }: ProviderText): string {
  return text(runFailedDebugMessages.providerSaid(said, status));
}

function text(message: Message): string {
  return plainText(message.phrase);
}
