import type { MessagingAuthor } from "@halonicjs/ports";

/**
 * The six agent tints of the kit's theme (HAL-19134), spelled out whole so the Studio's CSS build
 * finds each class.
 */
const tints = [
  "bg-agent-sky",
  "bg-agent-teal",
  "bg-agent-green",
  "bg-agent-sand",
  "bg-agent-coral",
  "bg-agent-indigo",
] as const;

/** One of the six agent tints, as a background class. */
export type AgentTint = (typeof tints)[number];

/**
 * An agent's bubble colour (`messenger.agent-bubbles`): picked from the agent's ID alone, so an
 * agent keeps one colour in every chat and channel, and across restarts. A message by a person
 * other than the user takes its colour from their name.
 */
export function agentTint(author: Exclude<MessagingAuthor, { kind: "me" }>): AgentTint {
  const key = author.kind === "agent" ? author.agent : author.name;
  let hash = 0;
  for (const character of key) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return tints[hash % tints.length] ?? tints[0];
}
