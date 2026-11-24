import type { CSSProperties } from "react";

/**
 * What an agent is doing, which draws the orb's ring (flow-agents 4.2): `needs` in `warning`, the
 * working states `talk`, `think` (dashed), `tool` and `work` in `running`, `listen` a
 * thin neutral ring, `error` and `done` in their status colours, `sleep` the orb faded, `idle` no
 * ring. The feature that knows the state writes its words next to the orb.
 */
export type AgentOrbState =
  | "needs"
  | "talk"
  | "think"
  | "tool"
  | "work"
  | "listen"
  | "error"
  | "done"
  | "sleep"
  | "idle";

/** The orb's box: 16 in lists, menus and chips, 24 in a chat header or tab, 64 in an empty chat. */
export type AgentOrbSize = 16 | 24 | 64;

/** The props of `AgentOrb`. */
export interface AgentOrbProps {
  /** The agent's id. Without colours of its own, it picks the pair, so one agent looks the same everywhere. */
  readonly agentId: string;
  /** The agent file's `character.colors`: the highlight, then the edge, each `#RRGGBB`. */
  readonly colors?: readonly [string, string] | undefined;
  readonly size: AgentOrbSize;
  /** The ring; `idle` draws none. */
  readonly state?: AgentOrbState | undefined;
}

/** How many colour pairs the theme has: `--character-1a` to `--character-5b`. */
const characterPairs = 5;

/**
 * An agent's character (flow-agents 4.3; HAL-397): a round orb in two colours, no face, with its
 * state as a ring inside a box of a fixed size, so nothing moves when a ring appears. It's
 * decoration, hidden from screen readers: the agent's name and its state words sit next to it.
 *
 * @example
 * <AgentOrb agentId="triage" colors={agent.colors} size={24} state="think" />
 */
export function AgentOrb({ agentId, colors, size, state = "idle" }: AgentOrbProps) {
  const [highlight, edge] = colors ?? characterPairOf(agentId);
  const look = { "--orb-a": highlight, "--orb-b": edge } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className="agent-orb"
      data-size={size}
      data-state={state}
      style={look}
    />
  );
}

/**
 * The theme's colour pair for an agent without its own: the same id always gives the same pair,
 * and ids that differ by one letter usually don't.
 */
export function characterPairOf(agentId: string): readonly [string, string] {
  let hash = 0;
  for (const character of agentId) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 1_000_003;
  }
  const pair = (hash % characterPairs) + 1;
  return [`var(--character-${pair}a)`, `var(--character-${pair}b)`];
}
