import type { PullRequestState, WorkState } from "@halonicjs/ports";
import type { RunOutcome } from "./activity.ts";

/**
 * The activity panel's words, as the board approved them on HAL-18558 (the activity-panel
 * document, revision 3, and its mockup). A pull request's state uses the Team app's approved
 * words, without their marks.
 */
export const activityWords = {
  /** The panel's landmark and heading: "Chief's activity". */
  title: (name: string) => `${name}'s activity`,
  /** The chat header's button: its tooltip, and its name while the agent works. */
  button: "Activity (Ctrl+I)",
  buttonWorking: (name: string) => `${name}'s activity, working`,
  close: "Close activity",
  /** On the chat's working line while the panel is closed. */
  show: "Show activity",
  working: "Working",
  forMinutes: (minutes: number) => `for ${duration(minutes)}`,
  lastActivityNow: "Last activity just now",
  lastActivity: (minutes: number) => `Last activity ${duration(minutes)} ago`,
  starting: "Starting",
  queuedAt: (time: string) => `queued at ${time}`,
  idle: "Idle",
  finished: (time: string) => `finished ${time}`,
  lastRunEnded: (time: string) => `last run ended ${time}`,
  next: "Next",
  earlierToday: "Earlier today",
  /** A run's start and length in **Earlier today**: "11:02 · 9 min". */
  startedFor: (time: string, minutes: number) => `${time} · ${duration(minutes)}`,
  /** Read out once when a run starts or ends, in the page's status region. */
  announceStarted: (name: string, task: string) => `${name} started: ${task}`,
  announceFinished: (name: string, task: string) => `${name} finished: ${task}`,
  workState: {
    todo: "To do",
    "in-progress": "In progress",
    "in-review": "In review",
    blocked: "Blocked",
    done: "Done",
    cancelled: "Cancelled",
    other: "",
  } satisfies Record<WorkState, string>,
  stoppedWithError: "Stopped with an error",
  task: "Task",
  lastRun: "Last run",
  pullRequests: "Pull requests",
  thisChat: "This chat",
  answeringYou: "Answering you",
  started: (time: string) => `Started ${time}`,
  run: (id: string) => `run ${id}`,
  /** A finished run's times: "14:02–14:09 · 7 min". */
  ran: (from: string, to: string, minutes: number) => `${from}–${to} · ${duration(minutes)}`,
  outcome: { done: "Done", failed: "Failed", stopped: "Stopped" } satisfies Record<
    RunOutcome,
    string
  >,
  /** The Messenger's own failed-read words (design review HAL-18481, improvement 3). */
  cantRead: (name: string) => `Couldn't read ${name}'s activity`,
  tryAgain: "Try again",
  pullRequestState: {
    draft: "Draft",
    "waiting-for-review": "Waiting for review",
    "changes-requested": "Changes requested",
    approved: "Approved",
    "approval-outdated": "Approval out of date",
    "in-queue": "In the queue",
    failing: "Failing",
    conflicting: "Conflicting",
    dequeued: "Taken out of the queue",
    merged: "Merged",
    closed: "Closed",
    other: "",
  } satisfies Record<PullRequestState, string>,
} as const;

/** "7 min", or "1 h 20 min" from an hour on. */
function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  const hours = `${Math.floor(minutes / 60)} h`;
  return rest === 0 ? hours : `${hours} ${rest} min`;
}
