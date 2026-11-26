import { CloseIcon, decidedAt, EmptyState, leave } from "@halonicjs/studio-kit";
import { type EngineWords, focusedPanelClass } from "@halonicjs/studio-shell";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { type ActivityView, minutesBetween } from "../activity.ts";
import { endedJustNow } from "../activity-today.ts";
import { activityWords } from "../activity-words.ts";
import { BackToChannel, useChannelFocus } from "./activity-channel.tsx";
import { EarlierRuns, NextTasks } from "./activity-lists.tsx";
import { arriveFromEnd } from "./activity-motion.ts";
import { ActivitySkeleton, PullRequests, Section, Status, TaskCard } from "./activity-parts.tsx";
import { reportMotion, useFadeIn } from "./load-states.tsx";
import type { ActivityRead } from "./use-activity.ts";

/** The panel's ID, for the chat header button's `aria-controls`. */
export const activityPanelId = "messenger-activity";

/**
 * Where the panel shows (HAL-18558 section 3): `beside` the chat on a wide window, a `sheet` over
 * the chat's right side on a medium one, or a `place` of its own instead of the chat on a narrow
 * one.
 */
export type PanelPlace = "beside" | "sheet" | "place";

const placeClass: Record<PanelPlace, string> = {
  // A panel of its own beside the chat, as the chat is (`messenger.framed-list`).
  beside: "w-80 shrink-0",
  sheet: "absolute inset-y-0 end-0 z-10 w-80 shadow-2",
  place: "min-w-0 flex-1",
};

/**
 * The activity panel (`messenger.activity-panel`, HAL-18558 revision 3): "Chief's activity", the
 * agent's status, the task it works on (or "This chat · Answering you") and its pull requests, or
 * its last run once it ended. Read-only: its only actions are the pull requests' links. Its status
 * dot is still; only the chat's working line moves. Beside the chat it fades in, as an opened chat
 * does (motion 1); a sheet comes in from the end and fades out as it closes, and **Esc** closes it;
 * a place has **‹ Chief** to go back (`messenger.activity-widths`). A sheet or a place takes the
 * focus as it opens, since it covers the button that opened it. In a channel, an agent's view has
 * **‹ Channel** to go back to the channel's agents (`messenger.activity-channel`).
 */
export function ActivityPanel({
  name,
  chat,
  shows,
  place = "beside",
  onClose,
  onBack,
  children,
}: {
  /** Whose activity the panel shows: "Chief's activity". */
  readonly name: string;
  /** The chat's name, for a place's way back to it: "‹ Chief". */
  readonly chat: string;
  /** What the body shows; when it changes, the body cross-fades to it. */
  readonly shows: string | undefined;
  readonly place?: PanelPlace;
  readonly onClose: () => void;
  /** Back from an agent's view to the channel's agents; none outside a channel. */
  readonly onBack?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const aside = useRef<HTMLElement>(null);
  const close = usePanelMotion(aside, place, onClose);
  const body = useRef<HTMLDivElement>(null);
  useFadeIn(body, shows);
  useChannelFocus(body, onBack !== undefined);
  const onKeyDown = (event: KeyboardEvent) => {
    if (place !== "sheet" || event.key !== "Escape") return;
    event.preventDefault();
    close();
  };
  return (
    <aside
      ref={aside}
      id={activityPanelId}
      aria-labelledby={`${activityPanelId}-title`}
      onKeyDown={onKeyDown}
      className={`flex flex-col ${placeClass[place]} ${focusedPanelClass}`}
    >
      <PanelHeader name={name} chat={chat} place={place} onClose={close} />
      <div ref={body} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        {onBack === undefined ? null : <BackToChannel onBack={onBack} />}
        {children}
      </div>
    </aside>
  );
}

/**
 * How the panel comes and goes: beside the chat it fades in; a sheet comes in from the end and
 * fades out as it closes; a sheet or a place takes the focus as it opens. Gives the panel's close.
 */
function usePanelMotion(
  aside: RefObject<HTMLElement | null>,
  place: PanelPlace,
  onClose: () => void,
): () => void {
  useFadeIn(aside, place === "beside");
  useLayoutEffect(() => {
    if (place === "sheet" && aside.current !== null) arriveFromEnd(aside.current);
  }, [aside, place]);
  useEffect(() => {
    if (place !== "beside") aside.current?.querySelector<HTMLElement>("[data-closes]")?.focus();
  }, [aside, place]);
  return () => {
    const sheet = aside.current;
    if (place !== "sheet" || sheet === null) return onClose();
    leave(sheet).then(onClose, (error: unknown) => {
      reportMotion(error);
      onClose();
    });
  };
}

/** "Chief's activity", with **×** to close it, or on a narrow window **‹ Chief** to go back. */
function PanelHeader({
  name,
  chat,
  place,
  onClose,
}: {
  readonly name: string;
  readonly chat: string;
  readonly place: PanelPlace;
  readonly onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
      {place === "place" ? (
        <button
          type="button"
          data-closes
          aria-label={activityWords.backTo(chat)}
          onClick={onClose}
          className="rounded-sm px-1 text-small text-fg-muted hover:text-fg"
        >
          <span aria-hidden="true">‹ </span>
          <bdi>{chat}</bdi>
        </button>
      ) : null}
      <h2 id={`${activityPanelId}-title`} className="flex-1 truncate text-body-strong">
        <bdi>{activityWords.title(name)}</bdi>
      </h2>
      {place === "place" ? null : (
        <button
          type="button"
          data-closes
          aria-label={activityWords.close}
          onClick={onClose}
          className="rounded-sm px-1 text-fg-muted hover:text-fg"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

/** One agent's activity: its status, task or last run, pull requests, Next and Earlier today. */
export function ActivityBody({
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
