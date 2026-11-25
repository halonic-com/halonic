import type {
  PluginConfigClient,
  PluginIssuesClient,
  PluginLogger,
  PluginStateClient,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { type MetricsApi, writeMetrics } from "./metrics.ts";
import {
  type CheckInput,
  precheckUrl,
  type ReadyForReviewDeps,
  type ReadyForReviewResult,
  readCheck,
  Unavailable,
  verdictOf,
  verdictText,
} from "./ready-for-review.ts";

/**
 * The checks agents wait on (HAL-18980, Track B of the token plan on
 * HAL-18938). When `ready_for_review` answers RUNNING, it remembers the check
 * with the task its branch names, and the `precheck-wake` job reads each
 * remembered check once a minute. When a check is done, or waited too long,
 * the job posts the answer on that task and wakes it once, so the agent
 * never calls the tool again to poll. The list is kept in plugin state, so a
 * restarted worker still wakes the tasks.
 */

/** The part of the plugin context the waits use, so tests can fake it. */
export interface PrecheckWaitsApi extends MetricsApi {
  readonly config: PluginConfigClient;
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly issues: Pick<PluginIssuesClient, "get" | "createComment" | "requestWakeup">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** One check an agent waits on, and the task to wake when it is done. */
export interface PrecheckWait {
  readonly checkId: string;
  readonly branch: string;
  readonly sha?: string;
  /** The task's id, for the comment and the wake. */
  readonly taskId: string;
  /** The task's identifier, such as HAL-1, for the answers. */
  readonly task: string;
  readonly agentId: string;
  /** When the tool remembered the check, in milliseconds. */
  readonly startedAt: number;
}

/** What one tool call needs: its agent's checks only through these two. */
export interface CallWaits {
  /** The remembered check the input asks for again, if there is one. */
  pending(input: CheckInput): Promise<PrecheckWait | undefined>;
  /**
   * Remembers a running check and gives the task that will be woken, or
   * undefined when the branch names no task the calling agent holds.
   */
  remember(checkId: string, input: { branch: string; sha?: string }): Promise<string | undefined>;
}

/** The waits of one plugin worker. */
export interface PrecheckWaits {
  forCall(runCtx: ToolRunContext): CallWaits;
  /** The `precheck-wake` job's pass for one company. */
  pass(companyId: string): Promise<void>;
}

/** A check still running after this long gets a CHECK UNAVAILABLE answer instead. */
export const waitTimeoutMs = 30 * 60_000;

/** The task a branch names by the `<agent>/<task>-<words>` rule, such as HAL-1. */
export function taskOfBranch(branch: string): string | undefined {
  return /^[a-z0-9-]+\/([A-Z][A-Z0-9]*-\d+)-/.exec(branch)?.[1];
}

interface StoredWaits {
  readonly version: 1;
  readonly waits: readonly PrecheckWait[];
}

function stateKey(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "precheck-waits",
    stateKey: "waits",
  } as const;
}

/** Whether the input asks for this check again: by its id, or the same branch and commit. */
function asksFor(wait: PrecheckWait, input: CheckInput): boolean {
  if ("checkId" in input) {
    return wait.checkId === input.checkId;
  }
  return wait.branch === input.branch && (input.sha === undefined || input.sha === wait.sha);
}

/**
 * Runs each change of a company's list after the one before it, so a tool
 * call and the job never overwrite each other's change. The worker is one
 * process, so a promise chain per company is enough.
 */
function oneAtATime() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(companyId: string, work: () => Promise<T>): Promise<T> => {
    const run = (tails.get(companyId) ?? Promise.resolve()).then(work, work);
    tails.set(
      companyId,
      run.catch(() => undefined),
    );
    return run;
  };
}

/** The answer for a check that is done, gone, or waited too long; undefined while it runs. */
async function finished(
  deps: ReadyForReviewDeps,
  base: string,
  wait: PrecheckWait,
): Promise<ReadyForReviewResult | undefined> {
  const timedOut = deps.now() - wait.startedAt >= waitTimeoutMs;
  try {
    const check = await readCheck(deps, base, wait.checkId);
    if (typeof check === "string") {
      return { verdict: "unavailable", checkId: wait.checkId, summary: check };
    }
    if (check.status === "done") {
      return verdictOf(check);
    }
  } catch (error) {
    if (!(error instanceof Unavailable)) {
      throw error;
    }
  }
  return timedOut
    ? {
        verdict: "unavailable",
        checkId: wait.checkId,
        summary: `check ${wait.checkId} didn't finish within ${waitTimeoutMs / 60_000} minutes`,
      }
    : undefined;
}

/** The waits kept in `ctx.state`, read through the service at `deps`. */
export function precheckWaits(
  ctx: PrecheckWaitsApi,
  deps: ReadyForReviewDeps,
  onRemember: (companyId: string) => void = () => undefined,
): PrecheckWaits {
  const serialized = oneAtATime();

  async function load(companyId: string): Promise<readonly PrecheckWait[]> {
    const stored = (await ctx.state.get(stateKey(companyId))) as StoredWaits | null;
    return stored?.version === 1 ? stored.waits : [];
  }

  function change(
    companyId: string,
    edit: (waits: readonly PrecheckWait[]) => readonly PrecheckWait[],
  ): Promise<void> {
    return serialized(companyId, async () => {
      const waits = edit(await load(companyId));
      await ctx.state.set(stateKey(companyId), { version: 1, waits } satisfies StoredWaits);
    });
  }

  /** Posts the answer on the task, and wakes it if the same agent still holds it. */
  async function deliver(companyId: string, wait: PrecheckWait, result: ReadyForReviewResult) {
    const body = `ready_for_review on \`${wait.branch}\`, check ${wait.checkId}:\n\n${verdictText(result)}`;
    await ctx.issues.createComment(wait.taskId, body, companyId);
    const issue = await ctx.issues.get(wait.taskId, companyId);
    const woken = issue?.assigneeAgentId === wait.agentId;
    if (woken) {
      // The key makes a second wake for the same check a no-op on the host.
      await ctx.issues.requestWakeup(wait.taskId, companyId, {
        reason: "ready_for_review",
        idempotencyKey: `ready-for-review ${wait.checkId}`,
      });
    }
    await writeMetrics(
      ctx,
      { "precheck.answers": 1 },
      { companyId, job: "precheck-wake", result: result.verdict, woken: woken ? "yes" : "no" },
    );
  }

  async function pass(companyId: string): Promise<void> {
    const waits = await load(companyId);
    if (waits.length === 0) {
      return;
    }
    const base = precheckUrl(await ctx.config.get(companyId));
    const done = new Set<string>();
    for (const wait of waits) {
      try {
        const result = await finished(deps, base, wait);
        if (result !== undefined) {
          await deliver(companyId, wait, result);
          done.add(wait.checkId);
        }
      } catch (error) {
        ctx.logger.error(
          `precheck-wake: check ${wait.checkId} for ${wait.task}: ${(error as Error).message}`,
          { companyId },
        );
      }
    }
    if (done.size > 0) {
      await change(companyId, (current) => current.filter((wait) => !done.has(wait.checkId)));
    }
  }

  async function remember(
    runCtx: ToolRunContext,
    checkId: string,
    input: { branch: string; sha?: string },
  ): Promise<string | undefined> {
    const { companyId, agentId } = runCtx;
    const identifier = taskOfBranch(input.branch);
    const issue = identifier === undefined ? null : await ctx.issues.get(identifier, companyId);
    if (issue === null || issue.assigneeAgentId !== agentId) {
      return undefined;
    }
    const task = issue.identifier ?? identifier ?? issue.id;
    const wait: PrecheckWait = {
      checkId,
      branch: input.branch,
      ...(input.sha === undefined ? {} : { sha: input.sha }),
      taskId: issue.id,
      task,
      agentId,
      startedAt: deps.now(),
    };
    // A new check on the same branch replaces the old one: only the newest push matters.
    await change(companyId, (waits) => [
      ...waits.filter((one) => one.branch !== input.branch && one.checkId !== checkId),
      wait,
    ]);
    onRemember(companyId);
    return task;
  }

  /** A failure costs the wake and is logged; the agent still gets an answer. */
  async function orNone<T>(companyId: string, what: string, work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      ctx.logger.error(`ready_for_review: ${what}: ${(error as Error).message}`, { companyId });
      return undefined;
    }
  }

  function forCall(runCtx: ToolRunContext): CallWaits {
    const { companyId } = runCtx;
    return {
      pending: (input) =>
        orNone(companyId, "couldn't read the checks waited on", async () =>
          (await load(companyId)).find((wait) => asksFor(wait, input)),
        ),
      remember: (checkId, input) =>
        orNone(companyId, `couldn't remember check ${checkId}`, () =>
          remember(runCtx, checkId, input),
        ),
    };
  }

  return { forCall, pass };
}
