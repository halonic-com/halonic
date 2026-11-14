/**
 * What {@link RunExecutor.startAgent} throws when the executor can't start
 * agent runs at all (requirement `ports.agent-runs-not-supported`), as the
 * local executor does until the agent loop is built. A caller that answers a
 * person, such as the host's run routes, can then tell "not here" from a real
 * failure. Check for it with {@link isAgentRunsNotSupported}, not
 * `instanceof`: an executor may be built against its own copy of this package.
 */
export class AgentRunsNotSupported extends Error {
  override readonly name = "AgentRunsNotSupported";
}

/** Whether `value` is an {@link AgentRunsNotSupported}: an `Error` with that name. It works across copies of this package. */
export function isAgentRunsNotSupported(value: unknown): value is AgentRunsNotSupported {
  return value instanceof Error && value.name === "AgentRunsNotSupported";
}
