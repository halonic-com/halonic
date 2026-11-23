import { waitReason } from "../board-check/waiting.ts";
import { loadSnapshot } from "../snapshot/store.ts";
import {
  type CheckAgent,
  type CheckPull,
  type CheckTask,
  invalidState,
  type RuleChecksRecord,
  ruleChecks,
} from "../worker-agents/rule-checks.ts";
import { type BoardCheckApi, errorCode, type PartPlan, stateKey } from "./board-check-api.ts";
import { pendingCard } from "./board-check-waiting.ts";
import type { ListedIssue } from "./host.ts";

/**
 * The board check's rule checks for the Worker agents page (HAL-16250): on
 * every job pass, from the pass's listing of open tasks and the PR watcher's
 * snapshot in plugin state. It writes nothing in Paperclip; it only saves the
 * result for the page, so opening the page reads no task, run or GitHub data.
 */

/** Pull request numbers a monitor's notes name, as `#5487` or `…/pull/5487`. Only the numbers are kept. */
export function pullsNamed(notes: string | null | undefined): number[] {
  const numbers = [...(notes ?? "").matchAll(/(?:\/pull\/|#)(\d{2,6})\b/g)].map((match) =>
    Number(match[1]),
  );
  return [...new Set(numbers)];
}

const iso = (value: Date | string | null | undefined) =>
  value == null ? null : new Date(value).toISOString();

/** A listed task as the checks read it; asks for board cards only when that decides the task state check. */
async function checkTask(
  ctx: BoardCheckApi,
  companyId: string,
  task: ListedIssue & { readonly identifier: string },
  now: Date,
): Promise<CheckTask> {
  const row: CheckTask = {
    identifier: task.identifier,
    status: task.status,
    assigneeAgentId: task.assigneeAgentId,
    blockerAttention: task.blockerAttention ?? null,
    running: task.activeRun != null,
    monitorNextCheckAt: iso(task.monitorNextCheckAt),
    monitorLastTriggeredAt: iso(task.monitorLastTriggeredAt),
    monitorPulls: pullsNamed(task.monitorNotes),
    startedAt: iso(task.startedAt),
    waitsOnBoard: false,
  };
  if (invalidState(row, now) === undefined) {
    return row;
  }
  const card = await pendingCard(ctx, task, companyId);
  return { ...row, waitsOnBoard: waitReason(task, card) !== undefined };
}

/** The snapshot's open pull requests from our own repositories, or undefined before the first snapshot. */
async function openPulls(ctx: BoardCheckApi, companyId: string) {
  let snapshot: Awaited<ReturnType<typeof loadSnapshot>>;
  try {
    snapshot = await loadSnapshot(ctx, companyId);
  } catch (error) {
    // A snapshot of a shape this code doesn't read: the PR checks say "Not available yet".
    ctx.logger.error(`Board check: couldn't read the GitHub snapshot (${errorCode(error)}).`, {
      companyId,
    });
    return undefined;
  }
  if (snapshot === undefined) {
    return undefined;
  }
  const pulls = snapshot.repos.flatMap(({ repo, pulls: listed }) =>
    listed.flatMap((pull): CheckPull[] =>
      pull.open === null || pull.headRepo?.toLowerCase() !== repo.toLowerCase()
        ? []
        : [
            {
              number: pull.number,
              url: pull.url,
              branch: pull.branch,
              updatedAt: pull.updatedAt,
              draft: pull.open.draft,
              ciFailed: pull.open.ciOk === "failure",
              conflicting: pull.open.mergeable === "no",
            },
          ],
    ),
  );
  return { takenAt: snapshot.takenAt, pulls };
}

/** Plans the rule checks: no writes, and the result saved for the page. */
export async function planRuleChecks(
  ctx: BoardCheckApi,
  companyId: string,
  input: { readonly openTasks: readonly ListedIssue[]; readonly agents: readonly CheckAgent[] },
  now: Date,
): Promise<PartPlan> {
  const tasks: CheckTask[] = [];
  for (const task of input.openTasks) {
    if (task.identifier !== null && task.assigneeAgentId !== null) {
      tasks.push(await checkTask(ctx, companyId, { ...task, identifier: task.identifier }, now));
    }
  }
  const github = await openPulls(ctx, companyId);
  const record: RuleChecksRecord = {
    at: now.toISOString(),
    prDataAt: github?.takenAt ?? null,
    agents: ruleChecks(input.agents, tasks, github?.pulls, now),
  };
  return { writes: [], save: () => ctx.state.set(stateKey(companyId, "rule-checks"), record) };
}
