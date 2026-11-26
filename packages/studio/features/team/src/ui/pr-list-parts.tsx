import { ListHeading } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { PullRequestRow } from "../pull-requests.ts";
import type { TeamClock } from "../team-format.ts";
import { PullRequestRowView, type WebLinkOpener } from "./pull-request-row.tsx";

/** The bordered box a list sits in, as the lists on Spend and seats. */
export const boxFrame = "rounded-md border border-border bg-surface";

/** One bordered list per section, its rows split by lines. */
export const listBox = `flex flex-col divide-y divide-border ${boxFrame}`;

/** A section of rows under its List heading: "Stuck · worst first", "Failing · 1". */
export function Section(props: { name: string; detail: string | undefined; children: ReactNode }) {
  const label = props.detail === undefined ? props.name : `${props.name} · ${props.detail}`;
  return (
    <section aria-label={label} className="flex flex-col">
      <ListHeading name={props.name} detail={props.detail} />
      {props.children}
    </section>
  );
}

/** One line in a bordered box where rows would be, with an optional button on its right. */
export function Note(props: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-4 py-3">
      <p>{props.children}</p>
      {props.action}
    </div>
  );
}

/** PR rows in one bordered list. */
export function RowList(props: {
  rows: readonly PullRequestRow[];
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  return (
    <ul className={listBox}>
      {props.rows.map((row) => (
        <PullRequestRowView
          key={row.pullRequest.id}
          row={row}
          clock={props.clock}
          opener={props.opener}
        />
      ))}
    </ul>
  );
}
