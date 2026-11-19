// A connector that can't start leaves its tools out of the turn. When a
// person approved a call to one of them, the call isn't made, and the run
// log says why: which program or secret was missing, never the error's text
// (HAL-13829).

import { maxCauseNameLength, type ToolFailureCause } from "@halonicjs/events";
import { type ChatMessage, connectorStartFailureOf, type ToolCall } from "@halonicjs/ports";
import type { ToolCallContext } from "./run-tool-call.ts";

/**
 * The cause for a connector that didn't start because of `error`: the
 * program or the secret's name when the error is one `connectorStartFailureOf`
 * reads, cut to `maxCauseNameLength`, else `other` with no name. Never any
 * part of the error's message, which can hold paths or a program's output.
 */
export function connectorNotStartedCause(error: unknown): ToolFailureCause {
  const failure = connectorStartFailureOf(error);
  if (failure === undefined) return { code: "connector-not-started", why: "other" };
  const name = failure.reason === "program-missing" ? failure.program : failure.secret;
  return {
    code: "connector-not-started",
    why: failure.reason,
    name: name.slice(0, maxCauseNameLength),
  };
}

/**
 * Answers `call`, which a person approved, to a tool of `connector`, whose
 * listing threw `error`: the call isn't made, so the run log gets its
 * `tool.result` with outcome `error` and a `connector-not-started` cause,
 * and the model hears that it wasn't made. There is no `tool.called`: it
 * reached nothing.
 */
export async function answerNotStarted(
  context: ToolCallContext,
  call: ToolCall,
  connector: string,
  error: unknown,
): Promise<ChatMessage> {
  const result = `The call wasn't made: the connector "${connector}" didn't start.`;
  await context.log?.append({
    type: "tool.result",
    agent: context.agent,
    tool: call.name,
    result,
    outcome: "error",
    cause: connectorNotStartedCause(error),
  });
  return { role: "tool", toolCallId: call.id, name: call.name, content: result };
}
