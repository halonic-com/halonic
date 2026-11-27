import type { PluginIssuesClient, PluginStateClient } from "@paperclipai/plugin-sdk";
import { type CloseGuards, mergeWindowOf } from "../pr-watcher/close-guards.ts";
import type { ConflictFiles } from "../pr-watcher/conflict-files.ts";
import type { FoundPulls } from "../pr-watcher/discover.ts";
import {
  type DoneOpenHost,
  type DoneOpenSummary,
  doneOpenPass,
  openPullKeys,
} from "../pr-watcher/done-open.ts";
import type { PullFactsReader } from "../pr-watcher/facts.ts";
import type { TaskRow } from "../pr-watcher/paperclip.ts";
import type { Snapshot } from "../snapshot/shape.ts";
import { doneToTodo, type HostApi, paperclipHost, wakeAssignee } from "./host.ts";

/**
 * The PR watcher's close guards and done-task pass on top of the plugin
 * host's API (HAL-18284). The pass's only task change is a done task back to
 * `todo` (`doneToTodo` in `host.ts`), re-read right before the write. Kept apart from
 * `host.ts` and `job.ts` so both stay under the size limit.
 */

/** The host's issues, with the board cards the close guard reads. */
type GuardIssues = Pick<PluginIssuesClient, "get" | "listInteractions">;

/**
 * The close guards from the company config: the `mergeWindowHours` setting,
 * and a board card read as a task in `in_review` held by a person or one
 * with a card nobody answered yet.
 */
export function closeGuardsOf(
  host: { readonly issues: GuardIssues },
  companyId: string,
  config: Readonly<Record<string, unknown>>,
): CloseGuards {
  return {
    mergeWindowHours: mergeWindowOf(config),
    boardCard: async (taskId) => {
      const issue = await host.issues.get(taskId, companyId);
      if (issue?.status === "in_review" && issue.assigneeUserId != null) {
        return true;
      }
      const cards = await host.issues.listInteractions(taskId, companyId);
      return cards.some((card) => card.status === "pending");
    },
  };
}

/** Re-reads the task: whether it is still done right before a write. */
async function stillDone(host: HostApi, taskId: string, companyId: string): Promise<boolean> {
  return (await host.issues.get(taskId, companyId))?.status === "done";
}

/** The done-task pass's Paperclip for one company. */
export function doneOpenHost(
  host: HostApi,
  companyId: string,
  noteState?: Pick<PluginStateClient, "get">,
): DoneOpenHost {
  const watcher = paperclipHost(host, companyId, noteState);
  return {
    async task(identifier) {
      const issue = await host.issues.get(identifier, companyId);
      return issue === null
        ? undefined
        : {
            id: issue.id,
            status: issue.status,
            assigneeAgentId: issue.assigneeAgentId,
            running: issue.activeRun != null,
          };
    },
    comments: (taskId) => watcher.comments(taskId),
    agents: () => watcher.agents(),
    async reopen(taskId, body, key) {
      if (!(await stillDone(host, taskId, companyId))) {
        return "closed";
      }
      await doneToTodo(host.issues, taskId, companyId);
      await host.issues.createComment(taskId, body, companyId);
      return wakeAssignee(host, taskId, companyId, key);
    },
    async warn(taskId, body) {
      if (!(await stillDone(host, taskId, companyId))) {
        return "closed";
      }
      await host.issues.createComment(taskId, body, companyId);
      return "written";
    },
  };
}

/** What the job hands the done-task pass from its own pass. */
export interface DoneOpenInput {
  readonly companyId: string;
  readonly snapshot: Snapshot;
  readonly found: FoundPulls;
  /** The tasks the tick read as open. */
  readonly tasks: readonly TaskRow[];
  readonly facts: PullFactsReader;
  readonly conflictFiles: ConflictFiles;
  readonly dryRun: boolean;
  readonly log: (line: string) => void;
}

/** Runs the done-task pass after the tick and logs what it did. */
export async function runDoneOpen(
  ctx: HostApi & { readonly state: Pick<PluginStateClient, "get"> },
  input: DoneOpenInput,
): Promise<DoneOpenSummary> {
  const summary = await doneOpenPass({
    host: doneOpenHost(ctx, input.companyId, ctx.state),
    found: input.found,
    openPulls: openPullKeys(input.snapshot),
    openTasks: new Set(input.tasks.map((task) => task.identifier)),
    facts: input.facts,
    conflictFiles: input.conflictFiles,
    dryRun: input.dryRun,
    log: input.log,
  });
  input.log(
    `PR watcher done tasks: ${summary.reopened} reopened, ${summary.warned} warned, ${summary.failed.length} failed`,
  );
  return summary;
}
