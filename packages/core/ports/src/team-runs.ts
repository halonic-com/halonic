import type { MessagingId } from "./agent-messaging.ts";
import type { AsOf, Money, TokenCount } from "./team-status.ts";

/**
 * Where a team agent's run is. `interrupted` is a run its host lost (a restart, a
 * killed process), which is neither a failure of the work nor a stop someone asked for.
 */
export type TeamRunState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "interrupted";

/** The task a run worked on. */
export interface TeamRunTask {
  id: MessagingId;
  /** The task's short name, such as `ACME-7`; left out when the source couldn't read the task. */
  identifier?: string;
  /** Plain text, never Markdown; left out with `identifier`. */
  title?: string;
}

/**
 * One run of a team agent (requirement `ports.team-runs`). Only these fields:
 * no log, output, prompt, error text or wake reason, so no screen can show them.
 */
export interface TeamRun {
  /** The run's opaque ID, for its link. */
  id: MessagingId;
  source: MessagingId;
  agent: MessagingId;
  /** Left out for a run that worked on no task, such as a chat-only run. */
  task?: TeamRunTask;
  state: TeamRunState;
  /** Left out while the run is queued. */
  startedAt?: string;
  /** Left out while the run is queued or running. */
  finishedAt?: string;
  /** The last sign of work: output, an event, or the start or finish. */
  lastActivityAt?: string;
  /** What the run was billed so far, when the source priced it; 0 for subscription work. */
  paid?: Money;
  /** The run's tokens so far, when the source counted them. */
  tokens?: TokenCount;
  /** Whether the source would stop the run now. */
  canStop: boolean;
}

/** Which runs to read. */
export interface TeamRunsQuery {
  /** Only this agent's runs; every agent's when left out. */
  agent?: MessagingId;
  /** Also the finished runs that started at or after this time, such as today's midnight. */
  since?: string;
}

/** One source's runs: the live ones, then the finished ones since the query's bound, newest first. */
export interface TeamRuns extends AsOf {
  source: MessagingId;
  runs: readonly TeamRun[];
  /**
   * False when the source holds more finished runs since the bound than one
   * read returns, so the oldest of them are missing ("Showing the latest 200").
   */
  complete: boolean;
}
