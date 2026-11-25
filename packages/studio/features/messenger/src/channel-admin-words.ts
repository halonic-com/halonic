import type { MessagingRefusal } from "@halonicjs/ports";

/**
 * The words for changing a channel's members and leaving it. Each is a row of HAL-17514's
 * `wording` table (flow H), approved with the phase 2 card on HAL-17544; the "adding shows
 * history" notice is Noah's on HAL-18165.
 */
export const channelAdminWords = {
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
  /** With 8 agents, Add an agent can't be used. */
  tooMany: "A channel can have up to 8 agents.",
  tryAgain: "Try again",
  /** The *reason* when the call itself failed, rather than being refused. */
  noAnswer: "the source didn't answer",
  /** The *reason* in a failed change or leave: "Couldn't leave Engineering: *reason*." */
  reason: {
    offline: (source: string) => `${source} is offline`,
    "signed-out": (source: string) => `you're signed out of ${source}`,
    "not-found": () => "the channel is gone",
    "too-large": () => "the source refused it",
    "unsupported-type": () => "the source refused it",
    "bad-answer": () => "the source refused it",
    "bad-members": () => "a channel takes 2 to 8 agents of one source",
    "not-supported": (source: string) => `${source} doesn't have channels`,
  } satisfies Record<MessagingRefusal, (source: string) => string>,
} as const;
