import {
  isAllowedWebLink,
  type MessagingAuthor,
  type MessagingId,
  type PullRequest,
  type PullRequestState,
} from "@halonicjs/ports";
import { Button, StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import { createContext, type ReactNode, useContext } from "react";
import { formatAge, pullRequestWords, type StateWords } from "../pull-request-words.ts";
import type { PullRequestRow } from "../pull-requests.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { Chevron } from "./detail-frame.tsx";

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
      <Button variant="secondary" size="sm" onClick={open}>
        {props.children}
      </Button>{" "}
      <bdi dir="ltr" className="text-small text-fg-muted wrap-anywhere">
        {link}
      </bdi>
    </span>
  );
}

/** Opens a PR's own page (P12); without it, a row's title opens nothing. */
export const OpenPullRequest = createContext<((id: MessagingId) => void) | undefined>(undefined);

/** The `data-opens` key of the title that opens a PR's page, so Back can focus it again. */
export const pullRequestKey = (id: MessagingId) => `pr:${id}`;

/**
 * "#5641 title" with the number as the muted mono label, on a row and as the PR page's h1. The
 * title is written by whoever opened the PR, outsiders included, so it's React text: never
 * Markdown or a link.
 */
export function PullRequestTitleWords({ pullRequest }: { pullRequest: PullRequest }) {
  return (
    <>
      <span className="font-mono text-small text-fg-muted">{pullRequest.label}</span>{" "}
      {pullRequest.title}
    </>
  );
}

/** A row's "#5641 title", as a button with › that opens the PR's page when the screen has one. */
export function PullRequestTitle({ pullRequest }: { pullRequest: PullRequest }) {
  const open = useContext(OpenPullRequest);
  const words = <PullRequestTitleWords pullRequest={pullRequest} />;
  if (open === undefined) return <p className="wrap-anywhere text-body-strong">{words}</p>;
  return (
    <p data-opens={pullRequestKey(pullRequest.id)} className="wrap-anywhere text-body-strong">
      <button
        type="button"
        onClick={() => open(pullRequest.id)}
        className="inline-flex items-start gap-1 rounded-xs text-start hover:underline focus-ring"
      >
        <span>{words}</span>
        <Chevron />
      </button>
    </p>
  );
}

/** A PR's author as a row names it; the port already gives the board and outsiders their words. */
export function authorName(author: MessagingAuthor): string {
  return author.kind === "me" ? "the board" : author.name;
}

/** Each state's chip tone, as the kit's tones mean them (HAL-17515 P11). */
const stateTones: Record<PullRequestState, StatusChipTone> = {
  draft: "neutral",
  "waiting-for-review": "running",
  "changes-requested": "attention",
  approved: "success",
  "approval-outdated": "attention",
  "in-queue": "accent",
  failing: "danger",
  conflicting: "danger",
  dequeued: "danger",
  merged: "success",
  closed: "neutral",
  other: "neutral",
};

/** The state's chip and detail words, as HAL-17515's state words have them. */
function stateWords(row: PullRequestRow, clock: TeamClock): StateWords {
  const { pullRequest, queue } = row;
  return pullRequestWords.state[pullRequest.state]({
    age: formatAge(minutesSince(pullRequest.since, clock)),
    time: formatTime(pullRequest.since, clock),
    reviewer: pullRequest.reviewer === undefined ? undefined : authorName(pullRequest.reviewer),
    reason: pullRequest.reason,
    queue:
      pullRequest.queue === undefined || queue === undefined
        ? undefined
        : { position: pullRequest.queue.position, total: queue.total },
    groupMinutes:
      queue?.groupSince === undefined ? undefined : minutesSince(queue.groupSince, clock),
  });
}

/** A "·" between two parts of a line, which screen readers hear as a pause. */
function Dot() {
  // Kept as written: a flex row would drop the spaces around the dot.
  return <span className="whitespace-pre text-fg-muted"> · </span>;
}

/**
 * The state line: a StatusChip in the state's tone with its symbol and word, the muted detail
 * after it, and the Fast-track tag. Colour is never the only sign: the chip always has its words.
 */
export function StateLine({ row, clock }: { row: PullRequestRow; clock: TeamClock }) {
  const { chip, detail } = stateWords(row, clock);
  return (
    <span className="flex flex-wrap items-center gap-y-1 text-small">
      {chip === "" ? null : (
        <StatusChip tone={stateTones[row.pullRequest.state]}>{chip}</StatusChip>
      )}
      {chip !== "" && detail !== undefined ? <Dot /> : null}
      {detail === undefined ? null : <span className="text-fg-muted">{detail}</span>}
      {row.pullRequest.fastTrack ? (
        <>
          <span className="sr-only"> · </span>
          <span className="ml-2">
            <StatusChip tone="outline">{pullRequestWords.fastTrack}</StatusChip>
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Who opened it and the task its branch names; with no task, says so and offers GitHub. The
 * Queue tab's rows use it too, so a queued PR can still be reached.
 */
export function OwnerLine({ row, opener }: { row: PullRequestRow; opener: WebLinkOpener }) {
  const { pullRequest, task } = row;
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-small text-fg-muted phone:justify-start">
      <span>
        {authorName(pullRequest.author)}
        {task === undefined ? null : ` · ${task.label}`}
      </span>
      {pullRequest.work === undefined ? (
        <>
          <span className="text-attention">{pullRequestWords.noTask}</span>{" "}
          <WebLinkButton link={pullRequest.webLink} opener={opener}>
            {pullRequestWords.openInGitHub}
          </WebLinkButton>
        </>
      ) : null}
    </span>
  );
}

/**
 * One PR row: its number and title over its state, with its author and task on the right (under
 * them on a phone). The title and the reason are written by whoever opened the PR, outsiders
 * included, so they're React text: never Markdown or a link. The title opens the PR's page (P12).
 */
export function PullRequestRowView(props: {
  row: PullRequestRow;
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  const { row, clock, opener } = props;
  const { pullRequest } = row;
  return (
    <li className="flex items-start justify-between gap-x-4 gap-y-2 px-4 py-3 phone:flex-col">
      <span className="flex min-w-0 flex-col gap-1">
        <PullRequestTitle pullRequest={pullRequest} />
        <StateLine row={row} clock={clock} />
      </span>
      <OwnerLine row={row} opener={opener} />
    </li>
  );
}
