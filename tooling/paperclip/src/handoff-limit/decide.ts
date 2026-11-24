/**
 * The hand-off limit's decision (K3, HAL-17628): pure, so the handler only
 * reads, writes and logs around it.
 */

/** The most hand-offs one channel child task may take (K3). */
export const handoffLimit = 3;

/** The comment the plugin leaves when it assigns a task back. */
export const stoppedComment = "Stopped after 3 hand-offs";

/** The tag that marks a channel's parent task (the Paperclip provider sets it, R2). */
export const channelTag = "channel";

/** What the plugin remembers about one child task. */
export interface HandoffRecord {
  /** The agent the plugin last saw holding the task. */
  readonly assigneeAgentId: string | null;
  readonly handoffs: number;
}

/** What to do about one assignee the plugin saw. */
export interface HandoffDecision {
  /** The record to save. */
  readonly record: HandoffRecord;
  /** Set when the change goes over the limit: the agent to assign the task back to. */
  readonly revertTo?: string;
}

/**
 * Counts a change of agent made by an agent. A change by a person, the system
 * or a plugin (the plugin's own assign-back included) is followed but not
 * counted, and so is a change to or from no agent.
 */
export function decideHandoff(
  before: HandoffRecord | undefined,
  assigneeAgentId: string | null,
  actorType: string,
): HandoffDecision {
  if (before === undefined) {
    return { record: { assigneeAgentId, handoffs: 0 } };
  }
  if (before.assigneeAgentId === assigneeAgentId) {
    return { record: before };
  }
  const previous = before.assigneeAgentId;
  if (actorType !== "agent" || previous === null || assigneeAgentId === null) {
    return { record: { assigneeAgentId, handoffs: before.handoffs } };
  }
  if (before.handoffs >= handoffLimit) {
    return { record: before, revertTo: previous };
  }
  return { record: { assigneeAgentId, handoffs: before.handoffs + 1 } };
}

/** Whether a tag list names a channel's parent, without regard to case or surrounding spaces. */
export function isChannelParent(labelNames: readonly string[]): boolean {
  return labelNames.some((name) => name.trim().toLowerCase() === channelTag);
}
