import { isAllowedWebLink, type PullRequest } from "@halonicjs/ports";
import {
  decidedAt,
  ExternalLink,
  enter,
  PlaceIcon,
  SKELETON_AFTER_MS,
  SkeletonBar,
  StatusChip,
  type StatusChipTone,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type ActivityTask, minutesBetween, type RunOutcome } from "../activity.ts";
import { activityWords } from "../activity-words.ts";
import { reportMotion } from "./load-states.tsx";

/*
 * The activity panel's parts (`messenger.activity-panel`): the status line, a section, the task
 * card, the pull requests and the loading skeleton.
 */

const dotTone = {
  working: "bg-accent",
  idle: "bg-fg-muted",
  done: "bg-success",
  failed: "bg-danger",
} as const;

/** "● Working · for 7 min": the status dot is still, the label strong, the detail muted. */
export function Status({
  tone,
  label,
  detail,
}: {
  readonly tone: keyof typeof dotTone;
  readonly label: string;
  readonly detail?: string | undefined;
}) {
  return (
    <p className="flex items-center gap-2 text-body">
      <span aria-hidden="true" className={`size-2 rounded-full ${dotTone[tone]}`} />
      <span>
        <b className="text-body-strong">{label}</b>
        {detail === undefined ? null : <span className="text-fg-muted"> · {detail}</span>}
      </span>
    </p>
  );
}

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-small text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

const outcomeTone = {
  done: "success",
  failed: "danger",
  stopped: "attention",
} as const satisfies Record<RunOutcome, StatusChipTone>;

/**
 * The task card, on the subtle fill: "HAL-18602" with its state chip ("In progress" while it runs,
 * Done, Failed or Stopped once it ended), its title, then "Started 14:02 · run 3f9c2a" or the
 * run's times.
 */
export function TaskCard({
  task,
  outcome,
}: {
  readonly task: ActivityTask;
  readonly outcome?: RunOutcome;
}) {
  const id = task.onChat ? activityWords.thisChat : task.identifier;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface-subtle px-3 py-2">
      <p className="flex flex-wrap items-center gap-2 text-small">
        {id === undefined ? null : <span className="text-body-strong">{id}</span>}
        {task.onChat ? (
          <span className="text-accent-text">{activityWords.answeringYou}</span>
        ) : null}
        <TaskState outcome={outcome} />
      </p>
      {task.title === undefined ? null : (
        <p className="text-body">
          <bdi>{task.title}</bdi>
        </p>
      )}
      <p className="text-small text-fg-muted">{factsOf(task)}</p>
    </div>
  );
}

function TaskState({ outcome }: { readonly outcome: RunOutcome | undefined }) {
  if (outcome === undefined)
    return <StatusChip tone="running">{activityWords.inProgress}</StatusChip>;
  return <StatusChip tone={outcomeTone[outcome]}>{activityWords.outcome[outcome]}</StatusChip>;
}

/** "Started 14:02 · run 3f9c2a" while it runs; "14:02–14:09 · 7 min" once it ended. */
function factsOf(task: ActivityTask): string {
  const run = activityWords.run(task.run);
  if (task.startedAt === undefined) return run;
  const from = decidedAt(task.startedAt);
  if (task.finishedAt === undefined) return `${activityWords.started(from)} · ${run}`;
  const minutes = minutesBetween(task.startedAt, task.finishedAt);
  return activityWords.ran(from, decidedAt(task.finishedAt), minutes);
}

/** The run's pull requests, each with its state; a link only where the source gave an allowed one. */
export function PullRequests({ pulls }: { readonly pulls: readonly PullRequest[] }) {
  if (pulls.length === 0) return null;
  return (
    <Section title={activityWords.pullRequests}>
      <ul className="flex flex-col gap-2">
        {pulls.map((pull) => (
          <PullRequestRow key={pull.id} pull={pull} />
        ))}
      </ul>
    </Section>
  );
}

function PullRequestRow({ pull }: { readonly pull: PullRequest }) {
  const name = (
    <bdi>
      {pull.label} {pull.title}
    </bdi>
  );
  const ref = useRef<HTMLLIElement>(null);
  // A new row fades in and rises (section 4): `enter`'s default.
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    enter(element).catch(reportMotion);
  }, []);
  return (
    <li ref={ref} className="flex items-center gap-2 text-small">
      <span
        aria-hidden="true"
        className="inline-grid size-icon-sm shrink-0 text-fg-muted *:size-full"
      >
        <PlaceIcon name="pull-requests" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {pull.webLink !== undefined && isAllowedWebLink(pull.webLink, undefined) ? (
          <ExternalLink href={pull.webLink}>{name}</ExternalLink>
        ) : (
          name
        )}
      </span>
      <span className="shrink-0 text-fg-muted">{activityWords.pullRequestState[pull.state]}</span>
    </li>
  );
}

/**
 * The kit's skeleton while the first read is on its way: nothing for 300 ms, so a fast read
 * doesn't flash. Hidden from screen readers.
 */
export function ActivitySkeleton() {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const show = setTimeout(() => setShowing(true), SKELETON_AFTER_MS);
    return () => clearTimeout(show);
  }, []);
  if (!showing) return null;
  return (
    <div aria-busy="true" aria-hidden="true" className="flex flex-col gap-3">
      <SkeletonBar kind="title" width="1/2" />
      <SkeletonBar kind="meta" width="2/3" />
    </div>
  );
}
