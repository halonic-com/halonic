// A state's agent can stop inside a `delegate_*` call, where one of its
// subagents waits (HAL-3361). The stop's events name that subagent, so the
// log and the approval card say which agent asked; `agent` stays the
// state's agent, which the run calls again.

import type { AgentResume } from "@halonicjs/events";

/**
 * The innermost subagent a stop waits in, as the `subagent` field of its
 * event, or no field when the state's own agent stopped.
 */
export function stoppedSubagentOf(resume: AgentResume): { subagent?: string } {
  let inner = resume.inner;
  if (inner === undefined) {
    return {};
  }
  while (inner.resume.inner !== undefined) {
    inner = inner.resume.inner;
  }
  return { subagent: inner.agent };
}
