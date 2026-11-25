import type { PluginIssuesClient } from "@paperclipai/plugin-sdk";
import { fastTrackLabel, taskOf } from "../pr-tools/queue-state.ts";
import type { Snapshot } from "../snapshot/shape.ts";

/**
 * Where a `fast-track` label added as `halonic-dev` counts (the board's
 * HAL-16003 scope note, 24 Nov): only on the pull requests of child tasks of
 * the listed tasks, and on the listed pull requests. The board extends the
 * list in the plugin setting `fastTrackSharedLabelScope`, without a code
 * change; the board's own login counts everywhere.
 */

/** The list as the board sets it: task identifiers whose child tasks count, and pull requests. */
export interface SharedLabelList {
  /** Task identifiers such as `HAL-17422`: a pull request of one of their child tasks counts. */
  readonly parents: readonly string[];
  /** Pull requests as `owner/name#123`. */
  readonly pulls: readonly string[];
}

/** What the rules read: the listed pull requests, and the child tasks found for this pass. */
export interface SharedLabelScope {
  /** Pull requests as `owner/name#123`. */
  readonly pulls: ReadonlySet<string>;
  /** Task identifiers whose parent is on the list. */
  readonly tasks: ReadonlySet<string>;
}

/** The board's list of 24 Nov: apps phase 1, and approvals stream PR 1 and 1b. */
export const defaultSharedLabelList: SharedLabelList = {
  parents: ["HAL-17422"],
  pulls: ["halonic-com/halonic#5659", "halonic-com/halonic#5674"],
};

/** Nothing on the list: a `halonic-dev` label counts nowhere. */
export const noSharedLabelScope: SharedLabelScope = { pulls: new Set(), tasks: new Set() };

const taskPattern = /^[A-Z][A-Z0-9]*-\d+$/;
const pullPattern = /^[\w.-]+\/[\w.-]+#[1-9]\d{0,8}$/;

/** Reads the setting; not a list: the board's default. Entries of neither form are left out. */
export function readSharedLabelList(value: unknown): SharedLabelList {
  if (!Array.isArray(value)) {
    return defaultSharedLabelList;
  }
  const entries = value
    .filter((each): each is string => typeof each === "string")
    .map((each) => each.trim());
  return {
    parents: entries.filter((each) => taskPattern.test(each)),
    pulls: entries.filter((each) => pullPattern.test(each)),
  };
}

/**
 * The scope for one pass: the tasks of the pull requests whose `fast-track`
 * label was added as `adder`, kept when their parent is on the list. One task
 * read per listed parent and per such pull request; a failed read throws.
 */
export async function sharedLabelScope(
  issues: Pick<PluginIssuesClient, "get">,
  companyId: string,
  snapshot: Snapshot,
  list: SharedLabelList,
  adder: string,
): Promise<SharedLabelScope> {
  const tasks = new Set<string>();
  const candidates = snapshot.repos.flatMap((repo) =>
    repo.pulls
      .filter((pull) =>
        pull.open?.labels.some((label) => label.name === fastTrackLabel && label.addedBy === adder),
      )
      .flatMap((pull) => taskOf(repo.repo, pull) ?? []),
  );
  if (candidates.length > 0 && list.parents.length > 0) {
    const parents = new Set<string>();
    for (const parent of list.parents) {
      const issue = await issues.get(parent, companyId);
      if (issue !== null) {
        parents.add(issue.id);
      }
    }
    for (const task of new Set(candidates)) {
      const parentId = (await issues.get(task, companyId))?.parentId;
      if (parentId != null && parents.has(parentId)) {
        tasks.add(task);
      }
    }
  }
  return { pulls: new Set(list.pulls), tasks };
}
