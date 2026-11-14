/**
 * What {@link RunExecutor.startAgent} throws when the executor refuses an agent run on purpose
 * because agent runs aren't built yet (requirement `ports.agent-runs-not-available`). A caller
 * that answers a person, such as the host's run routes, can then tell "not built yet" from a
 * real failure.
 *
 * Check for it with {@link isAgentRunsNotAvailable}, not `instanceof`: an executor may be built
 * against its own copy of this package.
 *
 * TODO(engine step 4): remove this with the mapping in `host/server` when the agent loop lands.
 */
export class AgentRunsNotAvailable extends Error {
  override readonly name = "AgentRunsNotAvailable";

  /** @param message - safe to log; the host doesn't send it to a client */
  constructor(message: string) {
    super(message);
  }
}

/**
 * Whether `value` is an {@link AgentRunsNotAvailable}: an `Error` named "AgentRunsNotAvailable".
 * It works across copies of this package, where `instanceof` doesn't.
 */
export function isAgentRunsNotAvailable(value: unknown): value is AgentRunsNotAvailable {
  return value instanceof Error && value.name === "AgentRunsNotAvailable";
}
