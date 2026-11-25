import {
  approvedOnHead,
  failingToNudge,
  isGreen,
  pendingOf,
  reviewerOf,
} from "../fast-track/checks.ts";
import { fastTrackLabel, taskOf } from "../pr-tools/queue-state.ts";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import type { LifecycleInput, LifecyclePull, LifecycleRun } from "./rules/fast-track-lifecycle.ts";

/**
 * The lifecycle rule's input, cut from the pass's GitHub snapshot
 * (HAL-17774): only the fields the rule reads, so a whole queue stays under
 * the 16 KB ToolScript `inputBytes` default (Liam, HAL-17772). The pull
 * requests are the open ones labelled `fast-track`, and every one that
 * still has a lifecycle run.
 */

function lifecyclePull(
  repo: Snapshot["repos"][number],
  pull: SnapshotPull,
  run: LifecycleRun | null,
): LifecyclePull {
  const open = pull.open;
  const base = repo.defaultBranch;
  const common = {
    pr: `${repo.repo}#${pull.number}`,
    task: taskOf(repo.repo, pull) ?? null,
    head: pull.head,
    reviewer: reviewerOf(pull),
    onDefaultBranch: pull.base === base,
    run,
  };
  if (open === null) {
    const state = pull.state === "merged" ? "merged" : "closed";
    return {
      ...common,
      state,
      labelled: false,
      draft: false,
      checksRunning: false,
      failing: [],
      approvedOnHead: false,
      green: false,
      inQueue: false,
    };
  }
  return {
    ...common,
    state: "open",
    labelled: open.labels.some((label) => label.name === fastTrackLabel),
    draft: open.draft,
    checksRunning: pendingOf(open).length > 0,
    failing: failingToNudge(pull, open, base),
    approvedOnHead: approvedOnHead(pull, open),
    green: isGreen(pull, open, base),
    inQueue: open.inQueue,
  };
}

/** The rule's input from `snapshot`, with each tracked pull request's run by `owner/name#123`. */
export function lifecycleInput(
  snapshot: Snapshot,
  runs: ReadonlyMap<string, LifecycleRun>,
): LifecycleInput {
  const pulls: LifecyclePull[] = [];
  for (const repo of snapshot.repos) {
    for (const pull of repo.pulls) {
      const pr = `${repo.repo}#${pull.number}`;
      const labelled = pull.open?.labels.some((label) => label.name === fastTrackLabel) === true;
      const run = runs.get(pr) ?? null;
      if (labelled || run !== null) {
        pulls.push(lifecyclePull(repo, pull, run));
      }
    }
  }
  return { now: snapshot.takenAt, pulls };
}
