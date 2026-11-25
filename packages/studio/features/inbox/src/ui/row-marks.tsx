import type { InboxItem as AgentItem } from "@halonicjs/ports";
import { Avatar, HelpIcon, type ListRow } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { InboxItem } from "../inbox-items.ts";

/*
 * The mark that leads each Needs you row, so an approval, a question, a person step and an agent's
 * card read apart at a glance (design review HAL-18481, 5; `inbox.row-marks`). The marks are
 * decoration: the row's title and meta line say what it is.
 */

/** The mark of a row's own item: a stamp for an approval, a pause for a person step, else none. */
export function itemMark(item: InboxItem): Pick<ListRow, "icon"> {
  if (item.kind === "approval") return { icon: <StampIcon /> };
  if (item.kind === "wait") return { icon: <PauseIcon /> };
  return {};
}

/** The mark of an agent's row: the agent's picture (its initials for now), else a question mark. */
export function agentMark(item: AgentItem | undefined): Pick<ListRow, "icon" | "avatar"> {
  if (item?.from.kind === "agent") return { avatar: <Avatar name={item.from.name} /> };
  return { icon: <HelpIcon /> };
}

/**
 * The approval mark: a stamp, since a tick already means "done" in the status colours, so it can't
 * also mean "waiting for your OK" (Noah's pass on HAL-18481).
 */
function StampIcon() {
  return (
    <MarkSvg>
      <path d="M9.5 4.5h5l-1 6.5h-3z" />
      <path d="M5 14.5h14v3H5z" />
      <path d="M7 20.5h10" />
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
