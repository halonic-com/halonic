import type { MessagingId } from "@halonicjs/ports";
import { type Pictures, usePictures } from "@halonicjs/studio-kit";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";

/** Each chat agent's decoded picture, by its avatar ID. */
export type AgentPictures = Pictures;

/** The picture of `row`'s chat agent, if it has one and it was read; a channel has none. */
export function pictureOf(pictures: AgentPictures, row: ConversationRow): ImageBitmap | undefined {
  const avatar = chatAgent(row)?.avatar;
  return avatar === undefined ? undefined : pictures.get(avatar);
}

/**
 * The picture of the agent with ID `agent`, for who asks in Needs you, also in a channel
 * (`messenger.needs-you`): found among `rows`' agents, and read already as a chat agent's. None
 * when no row lists the agent, it has no picture, or its picture wasn't read.
 */
export function pictureOfAgent(
  pictures: AgentPictures,
  rows: readonly ConversationRow[],
  agent: MessagingId,
): ImageBitmap | undefined {
  for (const row of rows) {
    const found = [...row.agents, ...row.sourceAgents].find((each) => each.id === agent);
    if (found?.avatar !== undefined) return pictures.get(found.avatar);
  }
  return undefined;
}

/**
 * Reads each chat agent's picture once while the Messenger is open (`messenger.agent-pictures`),
 * through the kit's `usePictures`: one that was refused or didn't decode keeps its
 * initial until the Messenger opens again. The pictures are closed when the Messenger closes.
 */
export function useAgentPictures(
  messenger: Messenger,
  rows: readonly ConversationRow[],
): AgentPictures {
  return usePictures(
    (avatar) => messenger.readAttachment(avatar),
    rows.flatMap((row) => chatAgent(row)?.avatar ?? []),
  );
}
