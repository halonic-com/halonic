import { type InboxItem as AgentItem, inboxItemKind } from "@halonicjs/ports";
import {
  Avatar,
  type AvatarSize,
  agentTint,
  KindIcon,
  type KindIconName,
  type ListRow,
} from "@halonicjs/studio-kit";
import type { InboxItem } from "../inbox-items.ts";

/*
 * The mark that leads each Needs you row, so an approval, a question, a person step and an agent's
 * card read apart at a glance (design review HAL-18481, 5; `inbox.row-marks`). Each mark sits on
 * the agent Avatar's round tile, 60px in the sidebar (HAL-19735), so every row's title starts at the
 * same place (HAL-18617).
 * The marks are decoration: the row's title and meta line say what it is. The open item's header
 * shows the same mark at 40px (`inbox.header-avatar`).
 */

/** The glyph of each of the Inbox's own kinds; a proposal keeps the gear it had. */
const ownKinds: Record<InboxItem["kind"], KindIconName> = {
  approval: "approval",
  wait: "wait",
  setup: "setup",
  proposal: "setup",
};

/**
 * The mark of a row's own item: a stamp for an approval, a pause for a person step, a gear for
 * setup, with no badge, since Halonic itself asks (`inbox.picture-badge`).
 */
export function itemMark(item: InboxItem, size: AvatarSize = "sidebar"): Pick<ListRow, "avatar"> {
  return { avatar: <Avatar name="" size={size} glyph={<KindIcon kind={ownKinds[item.kind]} />} /> };
}

/**
 * The mark that leads a Notices row (`inbox.notice-bell`): a bell on the same 60px tile as Needs
 * you's own marks, with no badge, since Halonic itself tells.
 */
export function noticeMark() {
  return <Avatar name="" size="sidebar" glyph={<KindIcon kind="notice" />} />;
}

/**
 * The mark of an agent's row (`inbox.picture-badge`): who asks as the picture, what kind of item
 * as the badge. An agent shows its `picture` when it was read, else its initial on its own tint,
 * keyed on its ID as in the Messenger (`kit.agent-tint`); a person their initials on the neutral
 * tile; a sender the source doesn't name a silhouette.
 */
export function agentMark(
  item: AgentItem | undefined,
  size: AvatarSize = "sidebar",
  picture?: ImageBitmap,
): Pick<ListRow, "avatar"> {
  const silhouette = <KindIcon kind="unknown" />;
  if (item === undefined) return { avatar: <Avatar name="" size={size} glyph={silhouette} /> };
  const badge = <KindIcon kind={inboxItemKind(item)} />;
  const { from } = item;
  if (from.kind === "agent") {
    const tint = agentTint(from.agent);
    return {
      avatar: <Avatar name={from.name} size={size} tint={tint} picture={picture} badge={badge} />,
    };
  }
  if (from.kind === "person") {
    return { avatar: <Avatar name={from.name} size={size} badge={badge} /> };
  }
  return { avatar: <Avatar name="" size={size} glyph={silhouette} badge={badge} /> };
}
