import { StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { QueueGroup, TakenOut } from "../merge-queue.ts";
import { mergeQueueWords } from "../merge-queue-words.ts";
import { formatAge, pullRequestWords } from "../pull-request-words.ts";
import type { PullRequestRow } from "../pull-requests.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { authorName, OwnerLine, type WebLinkOpener } from "./pull-request-row.tsx";

/** A "·" only screen readers hear, between parts a row lays out apart. */
function SpokenDot() {
  return <span className="sr-only"> · </span>;
}

/**
 * A header row inside the queue's one list (HAL-17515 P18): "Group 1" with its state chip after
 * it, or "Waiting to enter" alone. A heading, so screen readers can jump between groups.
 */
export function QueueHeaderRow(props: { name: string; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface-subtle px-4 py-2 first:rounded-t-md">
      <h2 className="text-small font-medium">{props.name}</h2>
      {props.children}
    </li>
  );
}

/** A group's state chip: its tone and its words, "Building · 9 min" or "Group failed: #5655". */
function groupChip(group: QueueGroup, clock: TeamClock): { tone: StatusChipTone; words: string } {
  if (group.state === "passed") return { tone: "success", words: mergeQueueWords.passed };
  if (group.state === "building") {
    return { tone: "running", words: mergeQueueWords.building(minutesSince(group.since, clock)) };
  }
  return { tone: "danger", words: mergeQueueWords.groupFailed(group.culprit?.pullRequest.label) };
}

/**
 * A group's header row: "Group 2" and its state chip. A failed one also says how many PRs behind
 * it are tested again, and which PR the queue session named as the cause.
 */
export function GroupHeaderRow({ group, clock }: { group: QueueGroup; clock: TeamClock }) {
  const { tone, words } = groupChip(group, clock);
  return (
    <QueueHeaderRow name={mergeQueueWords.group(group.position)}>
      <StatusChip tone={tone}>{words}</StatusChip>
      {group.state === "failed" && group.behind > 0 ? (
        <span className="text-small text-fg-muted">
          {mergeQueueWords.testedAgain(group.behind)}
        </span>
      ) : null}
      {group.culprit === undefined ? null : (
        <p className="basis-full text-small text-fg-muted">
          {mergeQueueWords.culprit(
            group.culprit.pullRequest.label,
            formatTime(group.culprit.at, clock),
          )}
        </p>
      )}
    </QueueHeaderRow>
  );
}

/**
 * One PR in the queue (P18): its position first, then its number and title, the Fast-track tag,
 * and at the end its author with its task (or "Open in GitHub" when it has none) and its time in
 * the queue. The position is the queue's own, never guessed.
 */
export function QueueRow(props: { row: PullRequestRow; clock: TeamClock; opener: WebLinkOpener }) {
  const { row, clock } = props;
  const { pullRequest } = row;
  return (
    <li className="flex items-center gap-x-3 gap-y-1 px-4 py-3 phone:flex-wrap">
      <span className="w-6 shrink-0 text-end text-body-strong tabular-nums">
        {pullRequest.queue?.position}
      </span>
      <p className="min-w-0 flex-1 wrap-anywhere text-body-strong">
        <span className="font-mono text-small text-fg-muted">{pullRequest.label}</span>{" "}
        {pullRequest.title}
      </p>
      {pullRequest.fastTrack ? (
        <>
          <SpokenDot />
          <StatusChip tone="outline">{pullRequestWords.fastTrack}</StatusChip>
        </>
      ) : null}
      <SpokenDot />
      <OwnerLine row={row} opener={props.opener} />
      <SpokenDot />
      <span className="w-28 shrink-0 text-end text-small text-fg-muted">
        {mergeQueueWords.queued(formatAge(minutesSince(pullRequest.since, clock)))}
      </span>
    </li>
  );
}

/**
 * A PR taken out today (P18): its number, the queue session's reason as a danger chip, and the
 * time and its author at the end ("#5628 Group failed: typecheck … 12:40 · Kim"). The reason is
 * plain text, as the queue session wrote it.
 */
export function TakenOutRow({ takenOut, clock }: { takenOut: TakenOut; clock: TeamClock }) {
  const { pullRequest } = takenOut;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span className="font-mono text-small text-fg-muted">{pullRequest.label}</span>
      <SpokenDot />
      <StatusChip tone="danger">{takenOut.reason}</StatusChip>
      <SpokenDot />
      <span className="ml-auto text-small text-fg-muted">
        {formatTime(takenOut.at, clock)} · {authorName(pullRequest.author)}
      </span>
    </li>
  );
}
