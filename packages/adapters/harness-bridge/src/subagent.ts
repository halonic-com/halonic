import type { IncomingHttpHeaders } from "node:http";
import type { ModelCall } from "./spend.ts";

/**
 * The headers a program puts only on its sub-agents' model calls, as
 * recorded on HAL-17263: Claude Code 2.1.325's `x-claude-code-agent-id`
 * and Codex 0.169's `x-openai-subagent`. Neither says the sub-agent's type,
 * and the bridge never records their values, which are ids.
 */
const subagentHeaders = ["x-claude-code-agent-id", "x-openai-subagent"];

/**
 * The label the run log gives every sub-agent's call, since the programs
 * don't send the sub-agent's type (requirement `harness-bridge.subagent-calls`).
 */
export const subagentLabel = "subagent";

/**
 * `call`, marked as a sub-agent's when the program's request headers say so
 * (requirement `harness-bridge.subagent-calls`); unchanged otherwise.
 */
export function withSubagent(call: ModelCall, headers: IncomingHttpHeaders): ModelCall {
  const fromSubagent = subagentHeaders.some((name) => headers[name] !== undefined);
  return fromSubagent ? { ...call, subagent: subagentLabel } : call;
}
