import type { InboxItem as AgentItem, MessagingId } from "@halonicjs/ports";
import { usePictures } from "@halonicjs/studio-kit";
import type { AgentInbox, AgentInboxState } from "../agent/agent-inbox.ts";

/** The picture of an item's asking agent, when it has one and it was read. */
export type AskerPicture = (item: AgentItem | undefined) => ImageBitmap | undefined;

/**
 * Reads the picture of each agent who put an item in the Inbox, once while the page is open, with
 * the kit's `usePictures` (`inbox.picture-badge`), the same pictures the Messenger shows. An agent
 * without one, or whose picture can't be read, keeps its initial on its tint.
 */
export function useAskerPictures(
  inbox: AgentInbox | undefined,
  state: AgentInboxState,
): AskerPicture {
  const askers = new Set(state.items.flatMap((item) => askingAgent(item) ?? []));
  const avatarOf = (agent: MessagingId) => state.agents.find((each) => each.id === agent)?.avatar;
  const pictures = usePictures(
    (avatar) =>
      inbox === undefined
        ? Promise.resolve({ outcome: "refused" as const })
        : inbox.readAttachment(avatar),
    [...askers].flatMap((agent) => avatarOf(agent) ?? []),
  );
  return (item) => {
    const agent = item === undefined ? undefined : askingAgent(item);
    const avatar = agent === undefined ? undefined : avatarOf(agent);
    return avatar === undefined ? undefined : pictures.get(avatar);
  };
}

function askingAgent(item: AgentItem): MessagingId | undefined {
  return item.from.kind === "agent" ? item.from.agent : undefined;
}
