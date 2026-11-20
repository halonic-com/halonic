/**
 * Taking turns on the live test account (HAL-13840). Every live-cloud run
 * shares one Cloudflare account, and D1 refuses work when several runs load it
 * at once ("Your account is generating too much load on D1 DBs"). A
 * concurrency group can't queue them: GitHub keeps one pending run per group
 * and cancels the older one, which fails that pull request's gate. So each run
 * waits its turn here instead: the lowest run ID goes first.
 */

/** The step that waits for the turn; a run past it holds the account. */
export const waitStepName = "Wait for the account";

/** The step that uses the account; a run whose suites finished has let go of it. */
export const suitesStepName = "Run the live suites";

/** The job that runs the live suites, as the workflow names it. */
export const liveJobName = "live-cloud";

/** A step of a job, as the Actions API lists it. */
export interface StepState {
  readonly name: string;
  readonly status: string;
}

/** A job of a run's latest attempt, as the Actions API lists it. */
export interface JobState {
  readonly name: string;
  readonly status: string;
  readonly steps: readonly StepState[];
}

/** Where another run stands with the account. */
export type RunStanding = "holding" | "before" | "done";

const stepDone = (job: JobState, name: string): boolean =>
  job.steps.some((step) => step.name === name && step.status === "completed");

/**
 * Where an unfinished run stands, from its latest attempt's jobs: `holding`
 * while its live job is past the wait and its suites haven't finished,
 * `done` once that job finished or its suites did, and `before` otherwise
 * (still planning, queued, or waiting its own turn).
 */
export function runStanding(jobs: readonly JobState[]): RunStanding {
  const liveJob = jobs.find((job) => job.name === liveJobName);
  if (liveJob === undefined) {
    return "before";
  }
  if (liveJob.status === "completed" || stepDone(liveJob, suitesStepName)) {
    return "done";
  }
  return stepDone(liveJob, waitStepName) ? "holding" : "before";
}

/**
 * The runs this one waits for: any run holding the account, and any run with
 * a lower ID that hasn't had its turn yet. The lowest unfinished run waits
 * for nobody but a holder, so the queue always moves.
 */
export function runsAhead(ownRunId: number, standings: ReadonlyMap<number, RunStanding>): number[] {
  const ahead: number[] = [];
  for (const [runId, standing] of standings) {
    if (runId === ownRunId || standing === "done") {
      continue;
    }
    if (standing === "holding" || runId < ownRunId) {
      ahead.push(runId);
    }
  }
  return ahead.sort((left, right) => left - right);
}

/** A run of the workflow that hasn't finished, and which attempt of it is current. */
export interface UnfinishedRun {
  readonly id: number;
  readonly attempt: number;
}

/** What the wait needs from GitHub and the clock. */
export interface TurnDeps {
  /** This workflow's runs that haven't finished. */
  readonly unfinishedRuns: () => Promise<UnfinishedRun[]>;
  /** The jobs of a run's latest attempt. */
  readonly jobs: (runId: number) => Promise<JobState[]>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (line: string) => void;
}

/**
 * How the wait ended: its turn came, it gave up after the longest wait, or it
 * couldn't read GitHub (`error` says why) and went ahead rather than fail a
 * run the suites would pass.
 */
export interface TurnResult {
  readonly outcome: "turn" | "gave-up" | "unreadable";
  readonly waitedMs: number;
  readonly ahead: readonly number[];
  readonly error?: string;
}

/**
 * How often to look again. Every workflow in the repository shares
 * GITHUB_TOKEN's hourly budget, so the waiters look only every 2 minutes.
 */
export const pollMs = 2 * 60_000;

/** The longest wait before going ahead anyway, so a stuck run can't block everyone. */
export const longestWaitMs = 45 * 60_000;

/**
 * Where each other unfinished run stands. A run attempt once seen done stays
 * done, so its jobs aren't asked for again; a re-run is a new attempt and is
 * looked at afresh.
 */
async function lookAtRuns(
  ownRunId: number,
  deps: TurnDeps,
  seenDone: Set<string>,
): Promise<Map<number, RunStanding>> {
  const standings = new Map<number, RunStanding>();
  for (const run of await deps.unfinishedRuns()) {
    const attemptKey = `${run.id}:${run.attempt}`;
    if (run.id === ownRunId || seenDone.has(attemptKey)) {
      continue;
    }
    const standing = runStanding(await deps.jobs(run.id));
    if (standing === "done") {
      seenDone.add(attemptKey);
    }
    standings.set(run.id, standing);
  }
  return standings;
}

/**
 * Waits until no run is ahead of `ownRunId`, looking once per `pollMs`. Gives
 * up after `longestWaitMs`. When GitHub can't be read it stops waiting and
 * returns the error: the wait only helps, so it never fails the run.
 */
export async function waitForTurn(ownRunId: number, deps: TurnDeps): Promise<TurnResult> {
  const started = deps.now();
  const seenDone = new Set<string>();
  let ahead: number[] = [];
  for (;;) {
    let standings: Map<number, RunStanding>;
    try {
      standings = await lookAtRuns(ownRunId, deps, seenDone);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: "unreadable", waitedMs: deps.now() - started, ahead, error: message };
    }
    ahead = runsAhead(ownRunId, standings);
    const waitedMs = deps.now() - started;
    if (ahead.length === 0) {
      return { outcome: "turn", waitedMs, ahead };
    }
    if (waitedMs >= longestWaitMs) {
      return { outcome: "gave-up", waitedMs, ahead };
    }
    deps.log(`live-turn: waiting for run(s) ${ahead.join(", ")} to finish their live suites.`);
    await deps.sleep(pollMs);
  }
}
