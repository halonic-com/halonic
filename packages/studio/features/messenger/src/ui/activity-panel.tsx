import type { PullRequestList, TeamRuns } from "@halonicjs/ports";
import { CloseIcon, decidedAt, EmptyState } from "@halonicjs/studio-kit";
import { type EngineWords, focusedPanelClass } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ActivityView, activityView, minutesBetween } from "../activity.ts";
import { activityWords } from "../activity-words.ts";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { ActivitySkeleton, PullRequests, Section, Status, TaskCard } from "./activity-parts.tsx";
import { useFadeIn } from "./load-states.tsx";

/** The panel's ID, for the chat header button's `aria-controls`. */
export const activityPanelId = "messenger-activity";

/** How often the panel reads while open, and while closed for the header button's dot. */
const readEveryMs = { open: 15_000, closed: 30_000 };

/** What the panel last read: nothing yet, the agent's activity, and whether the newest read failed. */
export interface ActivityRead {
  readonly view: ActivityView | undefined;
  readonly failure: unknown;
  readonly read: () => void;
}

/**
 * The open chat's agent's activity (`messenger.activity-panel`): its runs since local midnight
 * and the pull requests, read every 15 seconds while the panel is open and every 30 while it is
 * closed, so the header button's dot stays right. A failed read keeps what was read last. The view
 * is worked out on each render, so a new list read (this chat's `agentWorking`) shows at once.
 */
export function useActivity(
  messenger: Messenger,
  row: ConversationRow,
  open: boolean,
): ActivityRead {
  const activity = messenger.activity;
  const agent = row.conversation.agent;
  const [read, setRead] = useState<
    { runs: readonly TeamRuns[]; pulls: readonly PullRequestList[] } | undefined
  >(undefined);
  const [failure, setFailure] = useState<unknown>(undefined);
  // Counts the reads, so an answer that lands after a newer read's never shows.
  const reads = useRef(0);
  const readNow = useCallback(() => {
    if (activity === undefined) return;
    reads.current += 1;
    const thisRead = reads.current;
    const since = startOfToday(messenger.now()).toISOString();
    Promise.all([activity.runs({ agent, since }), activity.pullRequests()]).then(
      ([runs, pulls]) => {
        if (thisRead !== reads.current) return;
        setRead({ runs, pulls });
        setFailure(undefined);
      },
      (error: unknown) => {
        console.error("The Messenger couldn't read the agent's activity:", error);
        if (thisRead === reads.current) setFailure(error);
      },
    );
  }, [activity, messenger, agent]);

  useEffect(() => {
    readNow();
    const every = setInterval(readNow, open ? readEveryMs.open : readEveryMs.closed);
    return () => clearInterval(every);
  }, [readNow, open]);

  const view =
    read === undefined ? undefined : activityView(row, read.runs, read.pulls, messenger.now());
  return { view, failure, read: readNow };
}

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
  if (view.kind === "ended") return <EndedBody view={view} />;
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

function EndedBody({ view }: { readonly view: Extract<ActivityView, { kind: "ended" }> }) {
  const at = view.task.finishedAt === undefined ? "" : decidedAt(view.task.finishedAt);
  const failed = view.outcome === "failed";
  return (
    <>
      {failed ? (
        <Status tone="failed" label={activityWords.stoppedWithError} detail={at || undefined} />
      ) : (
        <Status
          tone="done"
          label={activityWords.idle}
          detail={at ? activityWords.finished(at) : undefined}
        />
      )}
      <Section title={activityWords.lastRun}>
        <TaskCard task={view.task} outcome={view.outcome} />
      </Section>
      <PullRequests pulls={view.pullRequests} />
    </>
  );
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
