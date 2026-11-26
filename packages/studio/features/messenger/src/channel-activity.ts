import type { MessagingId, PullRequestList, TeamRuns } from "@halonicjs/ports";
import { type ActivityView, activityView } from "./activity.ts";
import { activityWords } from "./activity-words.ts";
import type { ConversationRow } from "./messenger.ts";

/** One line of a channel's activity panel: "Liam · Working on HAL-18592". */
export interface ChannelAgentLine {
  readonly agent: MessagingId;
  readonly name: string;
  /** "Working on HAL-18592", "Working", "Starting" or "Idle". */
  readonly status: string;
  readonly working: boolean;
}

/**
 * The channel's agents, one line each, the lead first (`messenger.activity-channel`, HAL-18558
 * section 2): what each one is doing, from the same runs the one-agent view reads. An agent its
 * source no longer lists is left out, since the panel has no name to show for it.
 *
 * @example
 * channelAgentLines(row, runs, pulls, now)[0]; // { name: "Liam", status: "Working on ACME-7", … }
 */
export function channelAgentLines(
  row: ConversationRow,
  runs: readonly TeamRuns[],
  pulls: readonly PullRequestList[],
  now: Date,
): readonly ChannelAgentLine[] {
  return row.agents.map((agent) => {
    const view = activityView(agentRow(row, agent.id), runs, pulls, now);
    return {
      agent: agent.id,
      name: agent.name,
      status: statusOf(view),
      working: view.kind === "working",
    };
  });
}

/**
 * The channel as one of its agents' chats, for that agent's view in the panel. No run answers the
 * person in a channel as it does in a chat, so the view never says "This chat · Answering you".
 */
export function agentRow(row: ConversationRow, agent: MessagingId): ConversationRow {
  const { members: _members, ...conversation } = row.conversation;
  return { ...row, conversation: { ...conversation, agent, agentWorking: false } };
}

function statusOf(view: ActivityView): string {
  if (view.kind === "queued") return activityWords.starting;
  if (view.kind !== "working") return activityWords.idle;
  const task = view.task.identifier;
  return task === undefined ? activityWords.working : activityWords.workingOn(task);
}
