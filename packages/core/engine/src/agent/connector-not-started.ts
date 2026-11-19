// A connector that can't start leaves its tools out of the turn. The run
// log says so, and when a person approved a call to one of its tools, the
// call isn't made and its result says why: which program or secret was
// missing, never the error's text (HAL-13829).

import { type ConnectorNotStartedCause, maxCauseNameLength } from "@halonicjs/events";
import { type ChatMessage, connectorStartFailureOf, type ToolCall } from "@halonicjs/ports";
import type { ToolCallContext } from "./run-tool-call.ts";
import type { TurnLog } from "./turn-log.ts";
import type { TurnTools } from "./turn-tools.ts";

/**
 * The cause for a connector that didn't start because of `error`: the
 * program or the secret's name when the error is one `connectorStartFailureOf`
 * reads, cut to `maxCauseNameLength`, else `other` with no name. Never any
 * part of the error's message, which can hold paths or a program's output.
 */
export function connectorNotStartedCause(error: unknown): ConnectorNotStartedCause {
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

/**
 * Logs a `connector.not-started` for each connector whose listing failed
 * while the turn's tools were collected, so the run log says which one
 * didn't start and why even when the model never calls its tools
 * (requirement `engine.turn-logs-connector-not-started`). A turn without a
 * log writes nothing.
 */
export async function logNotStarted(
  log: TurnLog | undefined,
  agent: string,
  tools: TurnTools,
): Promise<void> {
  for (const [connector, error] of tools.listingErrors) {
    await log?.append({
      type: "connector.not-started",
      agent,
      connector,
      cause: connectorNotStartedCause(error),
    });
  }
}
