/** A model tool call as stored in the log. */
export interface LoggedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Where an agent stopped to wait for an approval, so it can continue after a restart. */
export interface AgentResume {
  /** The conversation so far (chat messages, including the assistant's tool calls). */
  messages: unknown[];
  /** Tool calls of the current model reply still to handle, the one waiting for approval first. */
  calls: LoggedToolCall[];
  /** Model step the agent was on. */
  step: number;
}
