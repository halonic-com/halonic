import type { MessagingId, PullRequestEvent } from "@halonicjs/ports";
import { ListHeading } from "@halonicjs/studio-kit";
import { reviewFact, pullRequestDetailWords as words } from "../pull-request-detail-words.ts";
import { formatAge, pullRequestWords } from "../pull-request-words.ts";
import type { PullRequestPage, PullRequestRow, PullRequests } from "../pull-requests.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
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
        <p className="text-attention">{words.stuckSince(formatTime(pullRequest.since, clock))}</p>
      )}
      <Facts row={page.row} clock={clock} />
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

/** "Ravi · task HAL-17451 · 312 lines": who opened it, its task and its size, as far as known. */
function headerLine(row: PullRequestRow): string {
  const { pullRequest, task } = row;
  const parts = [authorName(pullRequest.author)];
  if (task !== undefined) parts.push(words.task(task.label));
  if (pullRequest.changedLines !== undefined) parts.push(words.lines(pullRequest.changedLines));
  return parts.join(" · ");
}

/** The Review, Queue and Task facts (P12–P17), each a term and its words. */
function Facts({ row, clock }: { row: PullRequestRow; clock: TeamClock }) {
  const { pullRequest } = row;
  const review = reviewFact({
    state: pullRequest.state,
    reviewer: pullRequest.reviewer === undefined ? undefined : authorName(pullRequest.reviewer),
    age: formatAge(minutesSince(pullRequest.since, clock)),
  });
  const facts: readonly (readonly [string, string])[] = [
    [words.facts.review, review],
    [words.facts.queue, queueFact(row, clock)],
    [words.facts.task, row.task?.label ?? pullRequestWords.noTask],
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

/** "1 of 7 · group 1" in the queue, "Taken out at 12:40" once taken out, or "Not in the queue". */
function queueFact(row: PullRequestRow, clock: TeamClock): string {
  const { pullRequest, queue } = row;
  if (pullRequest.state === "dequeued")
    return words.takenOutAt(formatTime(pullRequest.since, clock));
  if (pullRequest.queue === undefined || queue === undefined) return words.notInQueue;
  return words.queuePlace(pullRequest.queue.position, queue.total, pullRequest.queue.group);
}

/**
 * The PR's steps, oldest first, each with its time. A step's words come from the port as plain
 * text, written from the PR's life by the source: React text, never Markdown or a link.
 */
function Timeline({ events, clock }: { events: readonly PullRequestEvent[]; clock: TeamClock }) {
  if (events.length === 0) return null;
  return (
    <section aria-label={words.timeline} className="flex flex-col gap-1">
      <ListHeading name={words.timeline} />
      <ol className="flex flex-col gap-1">
        {events.map((event, index) => (
          // Steps can share a time and words, so their place in the list is their key.
          <li key={index} className="flex gap-3">
            <time dateTime={event.at} className="w-12 shrink-0 text-fg-muted tabular-nums">
              {formatTime(event.at, clock)}
            </time>
            <span className="wrap-anywhere">{event.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
