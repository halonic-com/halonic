import type { MessagingAgent } from "@halonicjs/ports";
import { Avatar, type AvatarSize, agentTint } from "@halonicjs/studio-kit";
import type { CSSProperties } from "react";
import { chatTint } from "../agent-tint.ts";
import { isChannel, pictureMembers } from "../channel.ts";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow } from "../messenger.ts";
import { type AgentPictures, agentPicture, pictureOf } from "./agent-pictures.ts";

/** Where a conversation's picture shows: its list row (48px) or its open header (40px). */
export type ChatAvatarSize = Extract<AvatarSize, "sidebar" | "header">;

/**
 * How a channel's two tiles sit in the picture's square: each tile's size, the square's classes,
 * and the mask that cuts a 2px gap out of the tile behind around the one in front, so the gap
 * shows whatever the row's fill is (the window's frame, a hovered row, the header's panel).
 * The front tile's centre, seen from the back tile's top left, is at `centre`; its radius plus the
 * gap is `gap`.
 */
const pairs = {
  sidebar: { tile: "row", square: "size-12", centre: 34, gap: 16 },
  header: { tile: "row", square: "size-10", centre: 26, gap: 16 },
} as const satisfies Record<
  ChatAvatarSize,
  { tile: AvatarSize; square: string; centre: number; gap: number }
>;

/**
 * A conversation's picture in the Messenger's list and header: a chat's agent, its picture or
 * its initial on its tint (`messenger.agent-pictures`, `messenger.agent-avatar-tint`); a channel's
 * lead in front with one more member behind (`messenger.channel-picture`, Sofia's proposal on
 * HAL-19491), each its picture or its initial on its own tint. A channel whose source lists no
 * member keeps its title's letters on the neutral tile. Decoration: the row's title names it.
 */
export function ChatAvatar({
  row,
  pictures,
  size,
}: {
  readonly row: ConversationRow;
  readonly pictures: AgentPictures;
  readonly size: ChatAvatarSize;
}) {
  const members = isChannel(row) ? pictureMembers(row) : undefined;
  if (members === undefined) {
    return (
      <Avatar
        name={chatAgent(row)?.name ?? row.conversation.title}
        picture={pictureOf(pictures, row)}
        tint={chatTint(row)}
        size={size}
      />
    );
  }
  if (members.behind === undefined) {
    return <MemberTile agent={members.front} pictures={pictures} size={size} />;
  }
  const pair = pairs[size];
  const cut = `radial-gradient(circle at ${pair.centre}px ${pair.centre}px, transparent ${pair.gap}px, #000 ${pair.gap + 0.5}px)`;
  const mask: CSSProperties = { maskImage: cut, WebkitMaskImage: cut };
  // Left and right, not start and end: the mask's cut is drawn from the left in every direction.
  return (
    <span aria-hidden="true" data-channel-picture="" className={`relative shrink-0 ${pair.square}`}>
      <span data-member="behind" className="absolute top-0 left-0 flex" style={mask}>
        <MemberTile agent={members.behind} pictures={pictures} size={pair.tile} />
      </span>
      <span data-member="front" className="absolute right-0 bottom-0 flex">
        <MemberTile agent={members.front} pictures={pictures} size={pair.tile} />
      </span>
    </span>
  );
}

/** One member's tile: their picture, or their initial on their own tint. */
function MemberTile({
  agent,
  pictures,
  size,
}: {
  readonly agent: MessagingAgent;
  readonly pictures: AgentPictures;
  readonly size: AvatarSize;
}) {
  return (
    <Avatar
      name={agent.name}
      picture={agentPicture(pictures, agent)}
      tint={agentTint(agent.id)}
      size={size}
    />
  );
}
