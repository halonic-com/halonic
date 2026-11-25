import type { InboxItem as AgentItem } from "@halonicjs/ports";
import { Avatar, HelpIcon, type ListRow, SettingsIcon } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { InboxItem } from "../inbox-items.ts";

/*
 * The mark that leads each Needs you row, so an approval, a question, a person step and an agent's
 * card read apart at a glance (design review HAL-18481, 5; `inbox.row-marks`). Each mark sits on
 * the agent Avatar's 28px round tile, so every row's title starts at the same place (HAL-18617).
 * The marks are decoration: the row's title and meta line say what it is.
 */

/** The mark of a row's own item: a stamp for an approval, a pause for a person step, a gear for setup. */
export function itemMark(item: InboxItem): Pick<ListRow, "avatar"> {
  if (item.kind === "approval") return { avatar: <MarkTile glyph={<StampIcon />} /> };
  if (item.kind === "wait") return { avatar: <MarkTile glyph={<PauseIcon />} /> };
  return { avatar: <MarkTile glyph={<SettingsIcon />} /> };
}

/** The mark of an agent's row: the agent's picture (its initials for now), else a question mark. */
export function agentMark(item: AgentItem | undefined): Pick<ListRow, "avatar"> {
  if (item?.from.kind === "agent") return { avatar: <Avatar name={item.from.name} /> };
  return { avatar: <MarkTile glyph={<HelpIcon />} /> };
}

/** A glyph centred on the Avatar's round tile, in its colours. */
function MarkTile({ glyph }: { readonly glyph: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted [&>svg]:size-4"
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
