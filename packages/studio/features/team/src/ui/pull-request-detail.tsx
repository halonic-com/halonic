import type { MessagingId, PullRequestEvent } from "@halonicjs/ports";
import { ListHeading } from "@halonicjs/studio-kit";
import { useId } from "react";
import { reviewFact, pullRequestDetailWords as words } from "../pull-request-detail-words.ts";
import { formatAge, pullRequestWords } from "../pull-request-words.ts";
import type { PullRequestPage, PullRequestRow, PullRequests } from "../pull-requests.ts";
import { formatDayTime, formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { DetailFrame, useDetail } from "./detail-frame.tsx";
import { authorName, StateLine, WebLinkButton, type WebLinkOpener } from "./pull-request-row.tsx";

const frameWords = {
  back: words.back,
  backSpoken: words.backSpoken,
  notFound: words.notFound,
  loadingTitle: pullRequestWords.place,
};

/**
 * One PR (requirement `team.pull-request-detail`, HAL-17515 P12–P17): its header, since when it's
 * stuck, the Review, Queue and Task facts, its timeline and the links that leave the app. It only
 * shows: nothing merges, queues or approves from here. "Open the failed check ↗", "Open task ↗"
 * and "Ask {name} in Messenger" wait for the port to carry their links.
 */
export function PullRequestDetailPage(props: {
  pullRequests: PullRequests;
  id: MessagingId;
  opener: WebLinkOpener;
  onBack: () => void;
}) {
  const { pullRequests, id } = props;
  const { shown, readAgain } = useDetail(pullRequests, () => pullRequests.detail(id), id);
  const clock = pullRequests.timeClock;
  return (
    <DetailFrame
      shown={shown}
      title={({ row }) => `${row.pullRequest.label} ${row.pullRequest.title}`}
      onBack={props.onBack}
      onTryAgain={readAgain}
      words={frameWords}
    >
      {(page) => <PullRequestBody page={page} clock={clock} opener={props.opener} />}
    </DetailFrame>
  );
}

function PullRequestBody(props: {
  page: PullRequestPage;
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  const { page, clock } = props;
  const { pullRequest } = page.row;
  return (
    <>
      <p className="text-fg-muted">{headerLine(page.row)}</p>
      <StateLine row={page.row} clock={clock} />
      {page.row.stuck.length === 0 ? null : (
        <p className="text-attention">{stuckLine(page.row, clock)}</p>
      )}
      <Facts page={page} clock={clock} />
      <p className="flex flex-wrap gap-3">
        <WebLinkButton link={pullRequest.webLink} opener={props.opener}>
          {pullRequestWords.openInGitHub}
        </WebLinkButton>
      </p>
      <Timeline events={page.timeline} clock={clock} />
      <p className="text-small text-fg-muted">{words.readOnly}</p>
    </>
  );
}

/**
 * A time as "11:00" today and "Tue 11:00" on an earlier day, so a PR stuck for two days doesn't
 * read as stuck since this morning.
 */
function when(at: string, clock: TeamClock): string {
  const day = (time: Date) => time.toLocaleDateString("en-CA", { timeZone: clock.timeZone });
  return day(new Date(at)) === day(clock.now()) ? formatTime(at, clock) : formatDayTime(at, clock);
}

/** "Stuck since 11:00", with when its fast-track review is due while it waits for one. */
function stuckLine(row: PullRequestRow, clock: TeamClock): string {
  const { pullRequest } = row;
  const since = words.stuckSince(when(pullRequest.since, clock));
  const waitsForFastTrack = pullRequest.fastTrack && pullRequest.state === "waiting-for-review";
  return waitsForFastTrack ? `${since} · ${words.fastTrackDue}` : since;
}

/** "Ravi · task HAL-17451 · 312 lines": who opened it, its task and its size, as far as known. */
function headerLine(row: PullRequestRow): string {
  const { pullRequest, task } = row;
  const parts = [authorName(pullRequest.author)];
  if (task !== undefined) parts.push(words.task(task.label));
  if (pullRequest.changedLines !== undefined) parts.push(words.lines(pullRequest.changedLines));
  return parts.join(" · ");
}

/** The Review, Queue and Task facts (P12–P17), each a term and its words. */
function Facts({ page, clock }: { page: PullRequestPage; clock: TeamClock }) {
  const { row } = page;
  const { pullRequest } = row;
  const review = reviewFact({
    state: pullRequest.state,
    reviewer: pullRequest.reviewer === undefined ? undefined : authorName(pullRequest.reviewer),
    age: formatAge(minutesSince(pullRequest.since, clock)),
  });
  const facts: readonly (readonly [string, string])[] = [
    [words.facts.review, review],
    [words.facts.queue, queueFact(row, clock)],
    [words.facts.task, taskFact(page)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {facts.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-fg-muted">{term}</dt>
          <dd className="wrap-anywhere">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "1 of 7 · group 1 · ci-ok running 9 min" in the queue, "Taken out at 12:40" once taken out, or
 * "Not in the queue".
 */
function queueFact(row: PullRequestRow, clock: TeamClock): string {
  const { pullRequest, queue } = row;
  if (pullRequest.state === "dequeued") return words.takenOutAt(when(pullRequest.since, clock));
  if (pullRequest.queue === undefined || queue === undefined) return words.notInQueue;
  const place = words.queuePlace(pullRequest.queue.position, queue.total, pullRequest.queue.group);
  if (queue.groupSince === undefined) return place;
  return `${place} · ${words.groupRunning(minutesSince(queue.groupSince, clock))}`;
}

/** "HAL-17451 · in progress · Ravi": the task, its state and who holds it, as far as known. */
function taskFact(page: PullRequestPage): string {
  const task = page.row.task;
  if (task === undefined) return pullRequestWords.noTask;
  const parts = [task.label, words.taskState[task.state], page.taskHolder ?? ""];
  return parts.filter((part) => part !== "").join(" · ");
}

/**
 * The PR's steps, oldest first, each with its time. A step's words come from the port as plain
 * text, written from the PR's life by the source: React text, never Markdown or a link.
 */
function Timeline({ events, clock }: { events: readonly PullRequestEvent[]; clock: TeamClock }) {
  const heading = useId();
  if (events.length === 0) return null;
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-1">
      <ListHeading id={heading} name={words.timeline} />
      <ol className="flex flex-col gap-1">
        {events.map((event, index) => (
          // Steps can share a time and words, so their place in the list is their key.
          <li key={index} className="flex gap-3">
            <time dateTime={event.at} className="w-20 shrink-0 text-fg-muted tabular-nums">
              {when(event.at, clock)}
            </time>
            <span className="wrap-anywhere">{event.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
