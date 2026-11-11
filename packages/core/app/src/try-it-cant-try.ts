// The steps a Try it run can't try because a change is left out of it
// (HAL-65 section F, `workspace.trust.try-it-leaves-out`, HAL-3277): found
// when the run's config is built, by loading the workspace as it is and as
// Try it reads it. Never quietly use the change instead.

import type { CantTryReason, CantTryStep, LeftOutReason } from "@halonicjs/events";
import type { KindName } from "@halonicjs/format";
import { type LoadedWorkspace, placeOf, type WorkspaceIssue } from "@halonicjs/workspace";
import type { LeftOutFile } from "./review-types.ts";
import type { RunFiles } from "./try-it-run-files.ts";

/** What finding the steps a run can't try needs. */
export interface CantTryInput {
  /** The path of the workflow or agent being tried. */
  readonly item: string;
  /** The workspace as it is. */
  readonly workspace: LoadedWorkspace;
  /** The workspace as Try it reads it. */
  readonly tried: LoadedWorkspace;
  /** The files the run reads, from `runFilesOf`. */
  readonly runFiles: RunFiles;
  /** Every left-out file, workspace-wide. */
  readonly leftOut: readonly LeftOutFile[];
}

/**
 * Which kinds of left-out file an issue that names something missing
 * points at, by the issue's code. Any other new error is put down to the
 * first left-out file the run reads.
 */
const missingKinds: Readonly<Record<string, readonly KindName[]>> = {
  "unknown-model-alias": ["models", "hub"],
  "unknown-fallback": ["models", "hub"],
  "unknown-model": ["models", "hub"],
  "unknown-provider": ["provider"],
  "unknown-connector": ["connector", "hub"],
  "unknown-knowledge": ["knowledge", "hub"],
  "unknown-skill": ["skill", "hub"],
  "unknown-collection": ["collection", "hub"],
  "shared-not-in-uses": ["hub"],
  "unknown-agent": ["agent"],
  "unknown-subagent": ["agent"],
  "unknown-workflow": ["workflow"],
};

/**
 * The steps of `item` that can't be tried with the left-out changes left
 * out, each with why. When the item itself is left out, that is the one
 * entry, with no step. Otherwise each error the run's files have only as
 * Try it reads them gives one entry per step that reads the file:
 * - in a left-out file, the file doesn't load with its baseline values:
 *   `invalid-without-change`;
 * - in another file, it names something only a left-out change adds:
 *   `needs-left-out-change`.
 *
 * An error in a file no step reads alone, such as `models.yaml`, or in an
 * agent being tried, has no step: the whole item can't be tried.
 *
 * @returns in the order the issues are in, without repeats; empty when every step can be tried
 */
export function cantTryAtLoad(input: CantTryInput): CantTryStep[] {
  const { item, workspace, tried, runFiles } = input;
  const leftOut = input.leftOut.filter((file) => runFiles.all.has(file.path));
  const itemLeftOut = leftOut.find((file) => file.path === item);
  if (itemLeftOut !== undefined && !loads(tried, item) && loads(workspace, item)) {
    const reason = {
      kind: "needs-left-out-change",
      path: item,
      leftOut: itemLeftOut.reason,
    } as const;
    return [{ status: "cant-try", item, step: null, reason }];
  }
  const known = new Set(workspace.issues.filter(isError).map(issueKey));
  const found = new Map<string, CantTryStep>();
  for (const issue of tried.issues) {
    if (!isError(issue) || !runFiles.all.has(issue.file) || known.has(issueKey(issue))) {
      continue;
    }
    const reason = reasonFor(issue, leftOut);
    for (const step of stepsReading(issue, item, runFiles)) {
      const entry: CantTryStep = { status: "cant-try", item, step, reason };
      found.set(JSON.stringify(entry), entry);
    }
  }
  return [...found.values()];
}

/** Why the error in `issue` makes a step impossible to try. */
function reasonFor(issue: WorkspaceIssue, leftOut: readonly LeftOutFile[]): CantTryReason {
  if (leftOut.some((file) => file.path === issue.file)) {
    return { kind: "invalid-without-change", path: issue.file, message: issue.message };
  }
  const kinds = missingKinds[issue.code] ?? [];
  const named =
    leftOut.find((file) => kinds.includes(placeOf(file.path)?.kind ?? "workspace")) ?? leftOut[0];
  if (named === undefined) {
    // Nothing left out explains it; say what fails to load.
    return { kind: "invalid-without-change", path: issue.file, message: issue.message };
  }
  const reason: LeftOutReason = named.reason;
  return { kind: "needs-left-out-change", path: named.path, leftOut: reason };
}

/** The steps that read the file of `issue`, or `[null]` when the whole item does. */
function stepsReading(issue: WorkspaceIssue, item: string, runFiles: RunFiles): (string | null)[] {
  if (issue.file === item) {
    const [first, step] = issue.path;
    return first === "states" && typeof step === "string" && runFiles.byStep.has(step)
      ? [step]
      : [null];
  }
  const steps = [...runFiles.byStep]
    .filter(([, files]) => files.has(issue.file))
    .map(([step]) => step);
  return steps.length > 0 ? steps : [null];
}

/** Whether `path` parsed in the workspace. */
function loads(workspace: LoadedWorkspace, path: string): boolean {
  return workspace.files.some((file) => file.path === path);
}

function isError(issue: WorkspaceIssue): boolean {
  return issue.severity === "error";
}

/** What tells one issue from another across the two loads; the line moves with the text, so it isn't part. */
function issueKey(issue: WorkspaceIssue): string {
  return JSON.stringify([issue.file, issue.code, issue.path]);
}
