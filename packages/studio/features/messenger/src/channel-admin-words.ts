import type { ChannelResult, MessagingRefusal } from "@halonicjs/ports";

/** A refusal with no words of its own: "Paperclip · Acme refused it". */
const refusedBy = (source: string) => `${source} refused it`;

/**
 * The words for starting, browsing, joining and leaving channels and changing their members. Each
 * is a row of HAL-17514's `wording` table (flows G and H), approved with the phase 2 card on
 * HAL-17544; the "adding shows history" notice is Noah's on HAL-18165.
 */
export const channelAdminWords = {
  menu: {
    label: "New",
    channel: "New channel",
    browse: "Browse channels",
  },
  create: {
    title: "New channel",
    subtitle: "One conversation with several agents.",
    name: "Name",
    agents: "Agents",
    lead: "Lead",
    leadHint: "answers when you don't name anyone",
    confirm: "Create channel",
    busy: "Creating…",
    oneSource: (source: string) => `Agents from ${source} only. A channel stays in one place.`,
    tooFew: "Pick at least 2 agents.",
    nameNeeded: "Give the channel a name.",
    unread: "Couldn't load the agents.",
    sourceTooSmall: (source: string, count: number) =>
      `A channel needs at least 2 agents. ${source} has ${count}.`,
    nameTaken: (name: string) => `There's already a channel called ${name}.`,
    offline: (source: string) => `You can make a channel when ${source} answers again.`,
    failed: (reason: string) => `Couldn't make the channel: ${reason}.`,
    picked: (count: number, most: number) => `${count} of ${most} picked`,
  },
  browse: {
    title: "Browse channels",
    subtitle: (source: string) => `Channels in ${source} you aren't in.`,
    empty: (source: string) => `No other channels in ${source}.`,
    join: "Join",
    unread: "Couldn't load the channels.",
    joinFailed: (channel: string, reason: string) => `Couldn't join ${channel}: ${reason}.`,
  },
  leave: {
    button: "Leave channel",
    title: (channel: string) => `Leave ${channel}?`,
    line: "You can join again from Browse channels.",
    confirm: "Leave",
    busy: "Leaving…",
    failed: (channel: string, reason: string) => `Couldn't leave ${channel}: ${reason}.`,
  },
  members: {
    title: (count: number) => `Members · ${count}`,
    hint: (source: string) => `What each agent is doing now, in all of ${source}.`,
    lead: "Lead",
    add: "Add an agent",
    makeLead: "Make lead",
    remove: "Remove from channel",
    tooFewLeft: "A channel needs at least 2 agents. Add one, or archive the channel.",
    removeLead: {
      title: (lead: string) => `Remove ${lead}?`,
      line: (lead: string) => `${lead} is the lead. Pick a new lead first.`,
      newLead: "New lead",
      confirm: (lead: string) => `Remove ${lead}`,
    },
    /** Shown before `setMembers` adds anyone: the new member reads the channel's history (M5). */
    history: {
      line: (agent: string, channel: string) =>
        channel === ""
          ? `${agent} will see all earlier messages in this channel.`
          : `${agent} will see all earlier messages in ${channel}.`,
      confirm: (agent: string) => `Add ${agent}`,
    },
    busy: "Saving…",
    failed: (reason: string) => `Couldn't change the members: ${reason}.`,
  },
  /** With 8 agents, Add an agent can't be used and no ninth can be picked. */
  tooMany: "A channel can have up to 8 agents.",
  tryAgain: "Try again",
  /**
   * The *reason* in "Couldn't make the channel: *reason*." and the other failures. Each names the
   * source's label, never "the source" (Noah, HAL-18172).
   */
  reason: {
    offline: (source: string) => `${source} is offline`,
    "signed-out": (source: string) => `you're signed out of ${source}`,
    "not-found": () => "the channel is gone",
    "too-large": refusedBy,
    "unsupported-type": refusedBy,
    "bad-answer": refusedBy,
    "bad-members": () => "a channel needs 2 to 8 agents from one source",
    "not-supported": (source: string) => `${source} doesn't have channels`,
  } satisfies Record<MessagingRefusal, (source: string) => string>,
  /** The reason once the channel's source itself is gone, so it has no label to name (HAL-18224). */
  sourceGone: "the channel's connection is gone",
} as const;

/**
 * Why a channel call didn't go through, named by the source's label: its refusal, or for a call
 * that threw, "Paperclip · Acme didn't answer". Starting a channel has no channel to be gone yet, so
 * there `not-found` reads as a plain refusal. With no source (`undefined`), every reason but a gone
 * channel says the source is gone, so no line has a hole where the label goes.
 */
export function failureReason(
  result: ChannelResult | undefined,
  source: string | undefined,
  call: "start" | "change" = "change",
): string {
  if (result?.outcome === "done") return "";
  if (source === undefined) {
    const channelGone = result?.reason === "not-found" && call === "change";
    return channelGone ? channelAdminWords.reason["not-found"]() : channelAdminWords.sourceGone;
  }
  if (result === undefined) return `${source} didn't answer`;
  if (call === "start" && result.reason === "not-found") return refusedBy(source);
  return channelAdminWords.reason[result.reason](source);
}
