/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `RoutinesHostService` for each open workspace; the Routines feature's
 * list, dialogs and page read it, and so do the Triggers sections the feature adds to an agent's
 * and a workflow's page.
 */
import type { Guard } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Names one routine the way a deep link does: the hub its file is in (`null` at the workspace's root) and its id. */
export interface RoutineRef {
  readonly hubId: string | null;
  readonly id: string;
}

/** The six ways a routine can start, as the engine names them. */
export type RoutineTriggerKind = "schedule" | "every" | "manual" | "mail" | "signal" | "webhook";

/** What a routine starts: a workflow with its input, or an agent with its prompt. */
export type RoutineTarget =
  | {
      readonly kind: "workflow";
      /** The hub the workflow is in; the routine's own hub when the file doesn't say. */
      readonly hubId: string;
      readonly id: string;
      /** The input the run starts with, as JSON text. */
      readonly input: string;
    }
  | {
      readonly kind: "agent";
      readonly hubId: string;
      readonly id: string;
      readonly prompt: string;
    };

/** What a routine's target is like right now, which decides the line the Starts card shows. */
export type RoutineTargetState = "ready" | "not-found" | "never-live" | "in-trash";

/** What a routine's row on the Routines list shows. */
export interface RoutineListing extends RoutineRef {
  readonly name: string;
  /** Whether it starts on its own; Run now works either way. */
  readonly enabled: boolean;
  /** The routine as one line, as it is live: "Weekdays at 07:30 (Europe/Amsterdam) → Briefing". */
  readonly summary: string;
  /** The name of the workflow or agent it starts, for the line that says what deleting it stops. */
  readonly targetName: string;
  /** ISO time it next starts on its own; absent when it is off or its trigger isn't a clock. */
  readonly nextRun?: string | undefined;
  /** Held for a Google sign-in, which the row shows as "Needs sign-in again". */
  readonly needsSignIn: boolean;
  /** Runs of this routine that wait for a person, which the row shows as "Needs you". */
  readonly needsYou: number;
  /** The workspace isn't trusted, so routines wait; the row shows "Paused until trusted". */
  readonly pausedUntilTrusted: boolean;
}

/** When a routine starts, as the When card's fields hold it; one shape per {@link RoutineTriggerKind}. */
export type RoutineTrigger =
  | { readonly kind: "schedule"; readonly cron: string; readonly timeZone?: string | undefined }
  | { readonly kind: "every"; readonly interval: string }
  | { readonly kind: "manual" }
  | {
      readonly kind: "mail";
      /** The Google connector whose mailbox is checked. */
      readonly connector: string;
      readonly query: string;
      readonly every: string;
    }
  | { readonly kind: "signal"; readonly name: string; readonly when?: Guard | undefined }
  | { readonly kind: "webhook" };

/** A Google connector a mail trigger can watch, which the Mailbox picker lists. */
export interface RoutineMailbox {
  /** The connector's id, which the trigger's `connector` holds. */
  readonly connector: string;
  readonly name: string;
  /** The Google account it acts as, which the picker shows next to the name. */
  readonly account: string;
}

/** What to do when a time comes while the previous run is still going. */
export type RoutineOverlap = "skip" | "queue" | "allow";

/** What to do with the times missed while Halonic was closed or asleep. */
export type RoutineCatchUp = "none" | "last" | "all";

/** What a routine's live version holds, for the lines that say what is still live while a change isn't. */
export interface RoutineLiveValues {
  /** The live trigger in words: "Weekdays at 07:30". */
  readonly triggerSentence: string;
  /** The name of the workflow or agent the live version starts. */
  readonly targetName: string;
  readonly overlap: RoutineOverlap;
  readonly catchUp: RoutineCatchUp;
}

/** One routine as its page draws it: what is saved, which is what the fields show. */
export interface RoutineView extends RoutineRef {
  readonly name: string;
  readonly enabled: boolean;
  readonly trigger: RoutineTrigger;
  /** The trigger in words, from the engine: "Weekdays at 07:30". */
  readonly triggerSentence: string;
  /** The routine as one line, as {@link RoutineListing.summary} has it: "Weekdays at 07:30 → Briefing". */
  readonly summary: string;
  /** The name of the workflow or agent it starts, for the line that says what deleting it stops. */
  readonly targetName: string;
  readonly target: RoutineTarget;
  readonly targetState: RoutineTargetState;
  readonly overlap: RoutineOverlap;
  readonly catchUp: RoutineCatchUp;
  /** The file's path from the workspace folder. */
  readonly file: string;
  /** True once a version holds this routine, so the scheduler can start it. */
  readonly everLive: boolean;
  /** True while the saved routine differs from its live version. */
  readonly changesNotLive: boolean;
  /** ISO time its live version was made; absent before it has one or while the host can't say. */
  readonly liveSince?: string | undefined;
  /** What the live version holds; absent when the routine was never live or the host can't say. */
  readonly live?: RoutineLiveValues | undefined;
  /** Mistakes the checks found, such as a bad cron or an unknown time zone, in the engine's words. */
  readonly problems: readonly string[];
}

/** The changes a person makes on the page; each field present is written, the others stay as they are. */
export interface RoutineChanges {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly trigger?: RoutineTrigger;
  readonly target?: RoutineTarget;
  readonly overlap?: RoutineOverlap;
  readonly catchUp?: RoutineCatchUp;
}

/** The next times a routine starts on its own, soonest first; empty when it is off or has no clock. */
export interface RoutineNextTimes {
  /** ISO times. */
  readonly times: readonly string[];
  /** For an `every` routine that never ran: the times can only be "at the next check". */
  readonly atNextCheck: boolean;
}

/** Why a time didn't start, as the scheduler records it. */
export type RoutineSkipReason =
  | "busy"
  | "missed"
  | "latest"
  | "cap"
  | "window"
  | "changed"
  | "target-never-live"
  | "target-in-trash";

/** A range of due times that didn't start, as one quiet row of the Runs view. */
export interface RoutineSkip {
  readonly reason: RoutineSkipReason;
  /** ISO times of the oldest and the newest skipped time. */
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

/** What started a run of a routine. */
export type RoutineRunStart =
  | "schedule"
  | "catch-up"
  | "every"
  | "mail"
  | "signal"
  | "webhook"
  | "run-now";

/** One run a routine started, as a row of the Runs view. */
export interface RoutineRun {
  readonly runId: string;
  /** The id a person sees and types back, as in the Runs list. */
  readonly shortId: string;
  readonly startedAt: string;
  readonly outcome: "running" | "waiting" | "completed" | "failed" | "cant-try";
  readonly startedBy: RoutineRunStart;
}

/** A routine's runs, its skipped times and its queued times, which the Runs view draws together. */
export interface RoutineRuns {
  /** The newest runs, newest first. */
  readonly runs: readonly RoutineRun[];
  readonly skips: readonly RoutineSkip[];
  /** Times waiting for the previous run to end; absent while the engine can't say. */
  readonly queued?: { readonly from: string; readonly to: string; readonly count: number };
}

/** A hub a new routine can go in. */
export interface RoutineHub {
  readonly id: string;
  readonly name: string;
}

/** What the New routine dialog hands over. */
export interface NewRoutine {
  readonly name: string;
  readonly hubId: string;
}

/** Something a routine can start; what the Starts card's picker lists, in the hub's order. */
export interface RoutineTargetChoice {
  readonly kind: RoutineTarget["kind"];
  readonly hubId: string;
  readonly id: string;
  readonly name: string;
  /**
   * The workflow's `start:` block: the one input field it asks for and what it calls it, such as
   * `mail` with "Answer a customer's email". Absent for an agent and a workflow without one.
   */
  readonly start?: RoutineStartField | undefined;
}

/** The one input field a workflow asks for when it is started, as its `start:` block names it. */
export interface RoutineStartField {
  readonly label: string;
  readonly field: string;
}

/** The workflow or agent a Triggers section is on, which is what its routines start. */
export interface TriggerOwner {
  readonly kind: RoutineTarget["kind"];
  readonly hubId: string;
  readonly id: string;
}

/** One row of a Triggers section: a routine that starts its workflow or agent. */
export interface TriggerRow extends RoutineRef {
  readonly name: string;
  readonly enabled: boolean;
  /** The trigger in words. */
  readonly sentence: string;
  /** ISO time it next starts; absent when it is off or has no clock. */
  readonly nextRun?: string | undefined;
}

/** How a Run now ended without a run: the one reason, which the toast says with its step. */
export type RunNowRefusal =
  | { readonly reason: "signed-out"; readonly account: string }
  | { readonly reason: "not-trusted" }
  | { readonly reason: "target-not-found" }
  | { readonly reason: "target-never-live" }
  | { readonly reason: "target-in-trash" };

/** What Run now answers: the run it started, or why there is none. */
export type RunNowResult =
  | { readonly started: true; readonly runId: string; readonly shortId: string }
  | { readonly started: false; readonly refusal: RunNowRefusal };

/** A routine that was moved to the trash, and the way to bring it back. */
export interface TrashedRoutine {
  /** Puts the routine back as it was. Rejects with an `Error` whose message is one sentence when it can't. */
  undo(): Promise<void>;
}

/**
 * The workspace's routines, as the app reads and changes them. Changes are written to the routine
 * files as one undo step each, so listing, creating, editing and deleting work while the engine is
 * stopped; only {@link RoutinesHost.runNow} needs the engine.
 */
export interface RoutinesHost {
  /** The hubs a routine can be created in, in the workspace's order. */
  hubs(): readonly RoutineHub[];
  /** Every routine of the workspace. Rejects with the reason it couldn't read them. */
  list(): Promise<readonly RoutineListing[]>;
  /** One routine as its page draws it. Rejects with the reason it couldn't be read, or when it isn't there. */
  read(ref: RoutineRef): Promise<RoutineView>;
  /** The workflows and agents the routine's hub lets it start. */
  targets(ref: RoutineRef): Promise<readonly RoutineTargetChoice[]>;
  /** The Google connectors the routine can watch for mail: its hub's own first, then the shared ones. */
  mailboxes(ref: RoutineRef): Promise<readonly RoutineMailbox[]>;
  /** Writes `changes` to the routine's file; rejects with the reason it couldn't be written. */
  save(ref: RoutineRef, changes: RoutineChanges): Promise<void>;
  /** The next `count` times the routine starts on its own, from its live version. */
  nextTimes(ref: RoutineRef, count: number): Promise<RoutineNextTimes>;
  /** The routine's runs, skipped times and queued times. Rejects like {@link RoutinesHost.read}. */
  runs(ref: RoutineRef): Promise<RoutineRuns>;
  /**
   * Starts the routine's target now, also while the routine is off. Absent while the app has no
   * engine to start it, so the page shows no **Run now**. Rejects with {@link EngineNotAnswering}
   * when the engine can't be reached; a refusal the person can act on is a result, not a rejection.
   */
  runNow?(ref: RoutineRef): Promise<RunNowResult>;
  /**
   * Makes the routine live: opens Create version with only this routine's file, and answers
   * `"made"` once the version is created, `"cancelled"` when the person closed it. Absent while
   * the app can't offer that, so Run now's dialog has no **Make live first**. Rejects with the
   * reason the version couldn't be made.
   */
  makeLive?(ref: RoutineRef): Promise<"made" | "cancelled">;
  /**
   * Starts the Google sign-in for the account a Run now refused as signed out. Absent where the
   * sign-in can't run, so the toast has no **Sign in with Google**. Rejects with the reason it
   * couldn't start.
   */
  signIn?(account: string): Promise<void>;
  /**
   * Opens the workspace's one trust gate, and answers `"trusted"` once the person trusted the
   * workspace, `"declined"` on Not now. Absent where there is no folder to trust, so a not-trusted
   * refusal only says so.
   */
  askTrust?(): Promise<"trusted" | "declined">;
  /**
   * Moves the routine's file to the trash as one change. Rejects with the reason it couldn't, such
   * as when the routine is gone.
   */
  trash(ref: RoutineRef): Promise<TrashedRoutine>;
  /**
   * The name of a routine the host has read or made, for a tab or a page title, or `undefined`
   * before it has read it. Sync, because a tab is named the moment it opens.
   */
  nameOf(ref: RoutineRef): string | undefined;
  /** Calls `listener` each time the list may have changed; returns the way to stop. */
  subscribe(listener: () => void): () => void;
  /**
   * What {@link RoutinesHost.create} would make a routine in the hub run: the hub's first
   * workflow, else its first agent; `undefined` when the hub has neither. The New routine dialog
   * names it before the routine is made.
   */
  starterTarget(hubId: string): Promise<RoutineTargetChoice | undefined>;
  /**
   * Makes a manual routine in the hub that runs the hub's first workflow with input `{}`, or with
   * no workflow its first agent with the prompt "Describe what to do.", and returns where it is.
   * Rejects with {@link NothingToRun} when the hub has neither.
   */
  create(newRoutine: NewRoutine): Promise<RoutineRef>;
  /** The routines in the owner's hub that start it, sorted by name, for a Triggers section. */
  startingRoutines(owner: TriggerOwner): Promise<readonly TriggerRow[]>;
  /** Makes a manual routine named after the owner that starts it, and returns where it is. */
  addTrigger(owner: TriggerOwner): Promise<RoutineRef>;
}

/**
 * What {@link RoutinesHost.runNow} rejects with when the engine can't be reached. The page says
 * the words for where Studio runs and ignores this error's message.
 */
export class EngineNotAnswering extends KindedError {
  constructor() {
    super("unavailable", "The engine isn't answering.");
  }
}

/** What {@link RoutinesHost.create} rejects with when the hub has no workflow and no agent to run. */
export class NothingToRun extends KindedError {
  constructor() {
    super("invalid_input", "Create a workflow or an agent first; a routine runs one of them.");
  }
}

/** The open workspace's routines, provided by the app (`routines.host`). */
export const RoutinesHostService: ServiceKey<RoutinesHost> =
  serviceKey<RoutinesHost>("routines.host");
