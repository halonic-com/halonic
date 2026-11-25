import type { MessagingId } from "./agent-messaging.ts";

/** Version of the {@link TeamRunControl} port. A breaking change bumps it and comes with an ADR. */
export const teamRunControlVersion = 1;

/**
 * Why a source didn't do what was asked, as a closed set: a source's own
 * error text never reaches a screen, so each app says these in its own words.
 * `not-allowed` is a refusal by the source; `unreachable` is a source that
 * couldn't be asked (offline, signed out, or not answering).
 */
export type RunControlRefusal = "not-found" | "not-allowed" | "unreachable";

/** What asking a run to stop did. */
export type StopRunResult =
  /** The source took the stop; the run's state says when it has stopped. */
  | { outcome: "stopping" }
  /** `not-stoppable`: the source says the run can't be stopped now, such as one that has ended. */
  | { outcome: "refused"; reason: "not-stoppable" | RunControlRefusal };

/**
 * Why Run again isn't offered for a team run: its task is closed, its task
 * is with someone else now, or the run worked on no task.
 */
export type RunAgainBlock = "task-done" | "reassigned" | "no-task";

/** Whether Run again may be offered for a run, and when not, why. */
export type RunAgainCheck =
  | { offered: true }
  | {
      offered: false;
      why: RunAgainBlock | RunControlRefusal;
      /** The task's short name, such as `ACME-7`, when the source read it. */
      task?: string;
      /**
       * Who holds the task now, with `reassigned`: a display name only, never
       * a login, an email or an ID. Plain text, never Markdown.
       */
      holder?: string;
    };

/** What asking for a run again did: `woken` when the source woke the run's agent on its task. */
export type RunAgainResult =
  | { outcome: "woken" }
  | { outcome: "refused"; reason: RunAgainBlock | RunControlRefusal };

/**
 * How Studio's Runs app stops a team agent's run and runs it again
 * (requirement `ports.team-run-control`). It is apart from `TeamStatus`,
 * which stays read-only by type. Every call takes the run's opaque ID, the
 * same as `TeamRun.id`, and never the run itself: the source checks again
 * before it writes, so a stale `canStop` or task in the caller's copy can't
 * stop or wake anything. `runAgainCheck` only shapes what the app offers; it
 * guards nothing.
 *
 * @example
 * const result = await runControl.stop(run.id);
 * if (result.outcome === "refused") showStopFailed();
 */
export interface TeamRunControl {
  /** Asks the source to stop run `run`, when the source says now that it can. */
  stop(run: MessagingId): Promise<StopRunResult>;
  /** Whether Run again may be offered for run `run`: its task is open and still with its agent. */
  runAgainCheck(run: MessagingId): Promise<RunAgainCheck>;
  /** Wakes run `run`'s agent on the same task, after the same checks as `runAgainCheck`. */
  runAgain(run: MessagingId): Promise<RunAgainResult>;
}
