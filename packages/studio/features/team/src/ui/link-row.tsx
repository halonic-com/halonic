import { ChevronRightIcon } from "@halonicjs/studio-kit";
import { type ReactNode, useContext } from "react";
import type { TeamLink } from "../team-words.ts";
import { TeamLinks } from "./money-tiles.tsx";

/** The › at the end of a row that opens a page. */
export function RowChevron({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid size-icon-sm text-fg-muted *:size-full ${className}`}
    >
      <ChevronRightIcon />
    </span>
  );
}

/** The rows' box: one bordered list with divided rows, as s01 draws Needs you and Seats. */
const listBox = "flex flex-col divide-y divide-border rounded-md border border-border bg-surface";

/**
 * A section's rows as one bordered list (s01), with an optional `head` inside the box above them,
 * such as the seats' column names.
 */
export function RowList(props: { head?: ReactNode; children: ReactNode }) {
  return (
    <div className={listBox}>
      {props.head}
      <ul className="flex flex-col divide-y divide-border">{props.children}</ul>
    </div>
  );
}

/** A row's own box inside a RowList: its padding, and the text style the rows share. */
const rowBox = "block w-full px-4 py-3 text-left text-body";

/** Only a row that opens something reacts: the hover fill, and the focus ring. */
const opensClasses = `${rowBox} focus-ring transition hover:bg-surface-subtle active:bg-surface-subtle`;

/**
 * A row that opens a Paperclip page, as `LinkButton` does for a button: one button while links
 * are on; while the Offline banner shows, still in the Tab order but `aria-disabled`, naming the
 * banner as its reason, opening nothing and drawn as it was (s09); and a plain row with no › where
 * nothing can open a Paperclip page. A row that opens a page in the app is always a button.
 * `children` gets whether to draw the ›.
 */
export function LinkRow(props: {
  link: TeamLink;
  onLink: (link: TeamLink) => void;
  /** Opens a page inside the app instead, such as a seat's detail page: it works offline too. */
  onOpenInApp?: (() => void) | undefined;
  children: (opens: boolean) => ReactNode;
}) {
  const state = useContext(TeamLinks);
  if (props.onOpenInApp !== undefined) {
    return (
      <button type="button" className={opensClasses} onClick={props.onOpenInApp}>
        {props.children(true)}
      </button>
    );
  }
  if (state === "none") return <span className={rowBox}>{props.children(false)}</span>;
  if (state !== "on") {
    return (
      <button
        type="button"
        className={`${rowBox} focus-ring`}
        aria-disabled={true}
        aria-describedby={state.offBecause}
      >
        {props.children(true)}
      </button>
    );
  }
  return (
    <button type="button" className={opensClasses} onClick={() => props.onLink(props.link)}>
      {props.children(true)}
    </button>
  );
}
