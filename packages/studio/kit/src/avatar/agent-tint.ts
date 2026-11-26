/**
 * The six agent tints of the theme (HAL-19134), spelled out whole so the Studio's CSS build finds
 * each class.
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
 * An agent's own colour (`kit.agent-tint`), picked from a key alone: the agent's ID, or a person's
 * name when there is no ID. The same key gives the same tint in every app and across restarts, so
 * an agent keeps one colour in the Messenger, the Inbox and Studio.
 *
 * @example
 * <Avatar name={agent.name} tint={agentTint(agent.id)} />
 */
export function agentTint(key: string): AgentTint {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return tints[hash % tints.length] ?? tints[0];
}
