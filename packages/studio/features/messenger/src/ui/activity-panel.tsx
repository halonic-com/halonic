import { CloseIcon, decidedAt, EmptyState } from "@halonicjs/studio-kit";
import { type EngineWords, focusedPanelClass } from "@halonicjs/studio-shell";
import { useRef } from "react";
import { type ActivityView, minutesBetween } from "../activity.ts";
import { endedJustNow } from "../activity-today.ts";
import { activityWords } from "../activity-words.ts";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow } from "../messenger.ts";
import { EarlierRuns, NextTasks } from "./activity-lists.tsx";
import { ActivitySkeleton, PullRequests, Section, Status, TaskCard } from "./activity-parts.tsx";
import { useFadeIn } from "./load-states.tsx";
import type { ActivityRead } from "./use-activity.ts";

/** The panel's ID, for the chat header button's `aria-controls`. */
export const activityPanelId = "messenger-activity";

/**
 * The activity panel (`messenger.activity-panel`, HAL-18558 revision 3): "Chief's activity", the
 * agent's status, the task it works on (or "This chat · Answering you") and its pull requests, or
 * its last run once it ended. Read-only: its only actions are the pull requests' links. Its status
 * dot is still; only the chat's working line moves. It fades in when it opens, as an opened chat
 * does (motion 1).
 */
export function ActivityPanel({
  row,
  activity,
  now,
  words,
  onClose,
}: {
  readonly row: ConversationRow;
  readonly activity: ActivityRead;
  readonly now: Date;
  readonly words: EngineWords;
  readonly onClose: () => void;
}) {
  const name = chatAgent(row)?.name ?? row.conversation.title;
  const aside = useRef<HTMLElement>(null);
  useFadeIn(aside, true);
  // When a run starts or ends, the body cross-fades to the new view.
  const body = useRef<HTMLDivElement>(null);
  useFadeIn(body, activity.view?.kind);
  return (
    <aside
      ref={aside}
      id={activityPanelId}
      aria-labelledby={`${activityPanelId}-title`}
      className={`flex w-80 shrink-0 flex-col ${focusedPanelClass}`}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 id={`${activityPanelId}-title`} className="flex-1 truncate text-body-strong">
          <bdi>{activityWords.title(name)}</bdi>
        </h2>
        <button
          type="button"
          aria-label={activityWords.close}
          onClick={onClose}
          className="rounded-sm px-1 text-fg-muted hover:text-fg"
        >
          <CloseIcon />
        </button>
      </div>
      <div ref={body} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        <ActivityBody name={name} activity={activity} now={now} words={words} />
      </div>
    </aside>
  );
}

function ActivityBody({
  name,
  activity,
  now,
  words,
}: {
  readonly name: string;
  readonly activity: ActivityRead;
  readonly now: Date;
  readonly words: EngineWords;
}) {
  const { view, failure, read } = activity;
  if (view === undefined && failure !== undefined) {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={activityWords.cantRead(name)}
        action={{ label: activityWords.tryAgain, onClick: read }}
      />
    );
  }
  if (view === undefined) return <ActivitySkeleton />;
  return (
    <>
      {failure === undefined ? null : (
        <p className="text-small text-fg-muted">{words.showingLast}</p>
      )}
      <ViewBody view={view} now={now} />
      <NextTasks next={activity.next} />
      {view.kind === "ended" || view.kind === "idle" ? (
        <EarlierRuns runs={activity.earlier} />
      ) : null}
    </>
  );
}

function ViewBody({ view, now }: { readonly view: ActivityView; readonly now: Date }) {
  if (view.kind === "idle") return <Status tone="idle" label={activityWords.idle} />;
  if (view.kind === "queued") {
    const at =
      view.queuedAt === undefined ? undefined : activityWords.queuedAt(decidedAt(view.queuedAt));
    return (
      <>
        <Status tone="idle" label={activityWords.starting} detail={at} />
        <Section title={activityWords.task}>
          <TaskCard task={view.task} />
        </Section>
      </>
    );
  }
  if (view.kind === "ended") return <EndedBody view={view} now={now} />;
  const quiet = minutesBetween(view.lastActivityAt, now);
  return (
    <>
      <div className="flex flex-col gap-1">
        <Status
          tone="working"
          label={activityWords.working}
          detail={activityWords.forMinutes(minutesBetween(view.startedAt, now))}
        />
        <p className={`ps-4 text-small ${view.quiet ? "text-attention" : "text-fg-muted"}`}>
          {quiet === 0 ? activityWords.lastActivityNow : activityWords.lastActivity(quiet)}
        </p>
      </div>
      <Section title={activityWords.task}>
        <TaskCard task={view.task} />
      </Section>
      <PullRequests pulls={view.pullRequests} />
    </>
  );
}

/**
 * The last run once it ended: "Idle · finished 14:09" just after, "Idle · last run ended 13:41"
 * from 10 minutes on, and "Stopped with an error · 14:09" for a failed run.
 */
function EndedBody({
  view,
  now,
}: {
  readonly view: Extract<ActivityView, { kind: "ended" }>;
  readonly now: Date;
}) {
  const finishedAt = view.task.finishedAt;
  const at = finishedAt === undefined ? "" : decidedAt(finishedAt);
  const failed = view.outcome === "failed";
  const ended =
    finishedAt !== undefined && endedJustNow(finishedAt, now)
      ? activityWords.finished
      : activityWords.lastRunEnded;
  return (
    <>
      {failed ? (
        <Status tone="failed" label={activityWords.stoppedWithError} detail={at || undefined} />
      ) : (
        <Status tone="done" label={activityWords.idle} detail={at ? ended(at) : undefined} />
      )}
      <Section title={activityWords.lastRun}>
        <TaskCard task={view.task} outcome={view.outcome} />
      </Section>
      <PullRequests pulls={view.pullRequests} />
    </>
  );
}
