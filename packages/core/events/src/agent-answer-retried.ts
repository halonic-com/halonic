import type { RunFailureCause, RunFailureReason } from "./run-basics.ts";

/**
 * A step asked its agent again, in the same step, because the answer didn't
 * fit the agent's output and the agent's `answerRetries` allowed another try
 * (requirement `events.agent-answer-retried`). `reason`, `cause` and `error`
 * are what `run.failed` would have said. `attempt` counts the retries of the
 * step, from 1. `prompt` is what the new call asks: the step's prompt with
 * the error after it. The step goes on with the new call.
 */
export interface AgentAnswerRetriedEvent {
  type: "agent.answer-retried";
  state: string;
  agent: string;
  reason: RunFailureReason;
  cause?: RunFailureCause;
  error: string;
  attempt: number;
  prompt: string;
}
