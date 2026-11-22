/**
 * Which seat an agent's runs use, from the two fields of its Paperclip
 * settings that choose a Claude sign-in. No I/O here: the history job reads
 * the fields and the seats' settings, and keeps only the seat id this returns.
 */

import type { SeatId } from "./records.ts";

/** The parts of an agent's settings that choose its Claude sign-in. */
export interface AgentSignInFields {
  /** `CLAUDE_CONFIG_DIR` in the agent's environment, which wins over its connection. */
  readonly configDir: string | undefined;
  /** The connection the agent's settings name (`runtimeConfig.aiConnection.connectionId`). */
  readonly connectionId: string | undefined;
}

/** What a seat's settings say about how agents reach it. */
export interface SeatSignIn {
  readonly id: SeatId;
  readonly configDir: string;
  readonly connectionId: string | undefined;
}

/**
 * The seat the agent is on, or `undefined` when its sign-in is none of the
 * seats. A folder of its own in the agent's environment decides first, as it
 * does for Paperclip; otherwise its connection does.
 */
export function agentSeat(
  agent: AgentSignInFields,
  seats: readonly SeatSignIn[],
): SeatId | undefined {
  if (agent.configDir !== undefined) {
    const folder = withoutTrailingSlash(agent.configDir);
    return seats.find((seat) => withoutTrailingSlash(seat.configDir) === folder)?.id;
  }
  if (agent.connectionId === undefined) {
    return undefined;
  }
  return seats.find((seat) => seat.connectionId === agent.connectionId)?.id;
}

function withoutTrailingSlash(folder: string): string {
  return folder.length > 1 ? folder.replace(/\/+$/, "") : folder;
}
