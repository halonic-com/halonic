import { Card, ChevronRightIcon } from "@halonicjs/studio-kit";
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

/**
 * A row that opens a Paperclip page, as `LinkButton` does for a button: one button while links
 * are on; while the Offline banner shows, still in the Tab order but `aria-disabled`, naming the
 * banner as its reason and opening nothing; and a plain card with no › where nothing can open a
 * Paperclip page. A row that opens a page in the app is always a button. `children` gets whether
 * to draw the ›.
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
    return <Card onClick={props.onOpenInApp}>{props.children(true)}</Card>;
  }
  if (state === "none") return <Card>{props.children(false)}</Card>;
  return (
    <Card
      onClick={() => props.onLink(props.link)}
      unavailable={state === "on" ? undefined : { reason: state.offBecause }}
    >
      {props.children(true)}
    </Card>
  );
}
