import type { InboxItem as AgentItem } from "@halonicjs/ports";
import {
  Avatar,
  type AvatarSize,
  agentTint,
  HelpIcon,
  type ListRow,
  SettingsIcon,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { InboxItem } from "../inbox-items.ts";

/*
 * The mark that leads each Needs you row, so an approval, a question, a person step and an agent's
 * card read apart at a glance (design review HAL-18481, 5; `inbox.row-marks`). Each mark sits on
 * the agent Avatar's round tile, 60px in the sidebar (HAL-19735), so every row's title starts at the
 * same place (HAL-18617).
 * The marks are decoration: the row's title and meta line say what it is. The open item's header
 * shows the same mark at 40px (`inbox.header-avatar`).
 */

/** The mark of a row's own item: a stamp for an approval, a pause for a person step, a gear for setup. */
export function itemMark(item: InboxItem, size: AvatarSize = "sidebar"): Pick<ListRow, "avatar"> {
  if (item.kind === "approval") return { avatar: <MarkTile glyph={<StampIcon />} size={size} /> };
  if (item.kind === "wait") return { avatar: <MarkTile glyph={<PauseIcon />} size={size} /> };
  return { avatar: <MarkTile glyph={<SettingsIcon />} size={size} /> };
}

/**
 * The mark of an agent's row: the agent's picture (its initials for now) on the agent's own tint,
 * keyed on its ID as in the Messenger (`kit.agent-tint`), else a question mark.
 */
export function agentMark(
  item: AgentItem | undefined,
  size: AvatarSize = "sidebar",
): Pick<ListRow, "avatar"> {
  if (item?.from.kind === "agent") {
    return { avatar: <Avatar name={item.from.name} size={size} tint={agentTint(item.from.agent)} /> };
  }
  return { avatar: <MarkTile glyph={<HelpIcon />} size={size} /> };
}

/** The mark tile's size and its glyph's, as the Avatar's: 60px in the sidebar, 40px in a header. */
const markTileSize: Record<AvatarSize, string> = {
  row: "size-7 [&>svg]:size-4",
  header: "size-10 [&>svg]:size-5",
  sidebar: "size-15 [&>svg]:size-8",
};

/** A glyph centred on the Avatar's round tile, in its colours. */
function MarkTile({ glyph, size }: { readonly glyph: ReactNode; readonly size: AvatarSize }) {
  return (
    <span
      aria-hidden="true"
      className={`flex ${markTileSize[size]} shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted`}
    >
      {glyph}
    </span>
  );
}

/**
 * The approval mark: a stamp (knob, neck, pad and ink line), since a tick already means "done" in the status colours, so it can't
 * also mean "waiting for your OK" (Noah's pass on HAL-18481).
 */
function StampIcon() {
  return (
    <MarkSvg>
      <circle cx="12" cy="6" r="2.5" />
      <path d="M10.5 8.3 10 13" />
      <path d="M13.5 8.3 14 13" />
      <rect x="5" y="13" width="14" height="4.5" rx="1" />
      <path d="M7 21h10" />
    </MarkSvg>
  );
}

/** The person step's mark: a pause, since the run waits on a person. */
function PauseIcon() {
  return (
    <MarkSvg>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6" />
      <path d="M14 9v6" />
    </MarkSvg>
  );
}

/** The kit's icon frame: outline style on the 24 grid, in the text colour. */
function MarkSvg({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
