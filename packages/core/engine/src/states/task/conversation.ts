// A task state with `conversation` keeps its turns in the context under that
// key. The old engine (784f78d) logged the turns as the last
// `context.updated` of the step, after its output, artifact and signal: the
// turns kept so far, then the prompt and the answer (as JSON when it isn't
// text). The base fixture's recorded run log has one; this keeps that place
// and that value.

import type { WorkflowState } from "@halonicjs/format";
import type { Scope } from "@halonicjs/workflow";
import type { DecidedEvent } from "../../kernel/decide-types.ts";

/** One turn of a kept conversation. */
export interface Turn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * The turns of the state's conversation with this prompt and answer added.
 * Anything under the key that isn't a list of turns counts as none, and so
 * does each item of the list that isn't a turn.
 *
 * @returns the `context.updated` to append, or nothing for a state without `conversation`
 */
export function conversationTurns(
  state: WorkflowState,
  scope: Scope,
  prompt: string,
  answer: unknown,
): DecidedEvent[] {
  const key = state.conversation;
  if (key === undefined) {
    return [];
  }
  const kept = scope.context[key];
  const turns: Turn[] = [
    ...(Array.isArray(kept) ? kept.filter(isTurn) : []),
    { role: "user", content: prompt },
    { role: "assistant", content: textOf(answer) },
  ];
  return [{ type: "context.updated", key, value: turns }];
}

function textOf(answer: unknown): string {
  return typeof answer === "string" ? answer : (JSON.stringify(answer) ?? String(answer));
}

function isTurn(value: unknown): value is Turn {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (role === "user" || role === "assistant") && typeof content === "string";
}
