import { isAllowedWebLink, type MessagingAuthor } from "@halonicjs/ports";
import type { ReactNode } from "react";
import { formatAge, pullRequestWords } from "../pull-request-words.ts";
import type { PullRequestRow } from "../pull-requests.ts";
import { minutesSince, type TeamClock } from "../team-format.ts";

/** Where a web link may open: the connection's Paperclip origin, and the opener the shell gives. */
export interface WebLinkOpener {
  /** The connection's Paperclip origin, port included; links to any other page but GitHub's PR pages are refused. */
  readonly connectionOrigin: string | undefined;
  /** Opens a page in the system browser, never in the app. */
  readonly open: (link: string) => void;
}

/**
 * A button that opens a page outside the app (requirement
 * `team.pull-requests`): only a link `isAllowedWebLink` passes, checked
 * again on the click, with the full address shown next to it before it
 * opens. A link that fails isn't drawn at all.
 */
export function WebLinkButton(props: {
  link: string | undefined;
  opener: WebLinkOpener;
  children: ReactNode;
}) {
  const { link, opener } = props;
  if (link === undefined || !isAllowedWebLink(link, opener.connectionOrigin)) return null;
  const open = () => {
    if (isAllowedWebLink(link, opener.connectionOrigin)) opener.open(link);
  };
  return (
    <span title={link}>
      <button type="button" className="text-small text-accent" onClick={open}>
        {props.children}
      </button>{" "}
      <bdi dir="ltr" className="text-small text-fg-muted wrap-anywhere">
        {link}
      </bdi>
    </span>
  );
}

/** A PR's author as a row names it; the port already gives the board and outsiders their words. */
function authorName(author: MessagingAuthor): string {
  return author.kind === "me" ? "the board" : author.name;
}

/** The state word with its symbol, reason and age, as HAL-17515's state words have it. */
export function stateLine(row: PullRequestRow, clock: TeamClock): string {
  const { pullRequest, queue } = row;
  const word = pullRequestWords.state[pullRequest.state]({
    age: formatAge(minutesSince(pullRequest.since, clock)),
    reviewer: pullRequest.reviewer === undefined ? undefined : authorName(pullRequest.reviewer),
    reason: pullRequest.reason,
    queue:
      pullRequest.queue === undefined || queue === undefined
        ? undefined
        : { position: pullRequest.queue.position, total: queue.total },
    groupMinutes:
      queue?.groupSince === undefined ? undefined : minutesSince(queue.groupSince, clock),
  });
  return pullRequest.fastTrack ? `${word} · ${pullRequestWords.fastTrack}` : word;
}

/**
 * One PR row: its number and title, its state, its author and its task.
 * The title and the reason are written by whoever opened the PR, outsiders
 * included, so they're React text: never Markdown, a link or a button.
 */
export function PullRequestRowView(props: {
  row: PullRequestRow;
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  const { row, clock, opener } = props;
  const { pullRequest, task } = row;
  return (
    <li className="flex flex-col gap-0.5 border-b border-border py-2">
      <p className="truncate">
        {pullRequest.label} {pullRequest.title}
      </p>
      <p className="text-small">{stateLine(row, clock)}</p>
      <p className="text-small text-fg-muted">
        {authorName(pullRequest.author)}
        {task === undefined ? null : ` · ${task.label}`}
        {pullRequest.work === undefined ? (
          <>
            {` · ${pullRequestWords.noTask} `}
            <WebLinkButton link={pullRequest.webLink} opener={opener}>
              {pullRequestWords.openInGitHub}
            </WebLinkButton>
          </>
        ) : null}
      </p>
    </li>
  );
}
