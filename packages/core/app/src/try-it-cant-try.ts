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
 * Which kinds of left-out file an error that names something missing
 * points at, by the error's code. Only errors count, so a warning such as
 * `extra-argument` has no entry. A test checks the workspace checks give
 * each code.
 */
export const missingKinds: Readonly<Record<string, readonly KindName[]>> = {
  "unknown-model-alias": ["models", "hub"],
  "unknown-fallback": ["models", "hub"],
  "unknown-provider": ["provider"],
  "unknown-connector": ["connector", "hub"],
  "unknown-knowledge": ["knowledge", "hub"],
  "unknown-skill": ["skill", "hub"],
  "unknown-collection": ["collection", "hub"],
  "shared-not-in-uses": ["hub"],
  "unknown-agent": ["agent"],
  "unknown-subagent": ["agent"],
  "unknown-workflow": ["workflow"],
  // A method, or the input it takes, only the left-out version of an agent has.
  "unknown-method": ["agent"],
  "missing-argument": ["agent"],
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
    return [{ status: "cant-try", item, step: null, reason: itemReason(itemLeftOut, tried) }];
  }
  const known = new Set(workspace.issues.filter(isError).map(issueKey));
  const found = new Map<string, CantTryStep>();
  for (const issue of tried.issues) {
    const counts = isError(issue) && runFiles.all.has(issue.file) && !readByNoRun(issue);
    if (!counts || known.has(issueKey(issue))) {
      continue;
    }
    for (const step of stepsReading(issue, item, runFiles)) {
      const reason = reasonFor(issue, step, leftOut, runFiles);
      const entry: CantTryStep = { status: "cant-try", item, step, reason };
      found.set(JSON.stringify(entry), entry);
    }
  }
  return [...found.values()];
}

/**
 * Why a left-out item that Try it can't load can't be tried: its baseline
 * is there but has an error, such as one that doesn't parse, or there is
 * no baseline, as for a new file, so it needs the change.
 */
function itemReason(item: LeftOutFile, tried: LoadedWorkspace): CantTryReason {
  const error = tried.issues.find((issue) => isError(issue) && issue.file === item.path);
  if (error !== undefined) {
    return { kind: "invalid-without-change", path: item.path, message: error.message };
  }
  return { kind: "needs-left-out-change", path: item.path, leftOut: item.reason };
}

/** Why the error in `issue` makes `step` impossible to try; `null` is the whole item. */
function reasonFor(
  issue: WorkspaceIssue,
  step: string | null,
  leftOut: readonly LeftOutFile[],
  runFiles: RunFiles,
): CantTryReason {
  if (leftOut.some((file) => file.path === issue.file)) {
    return { kind: "invalid-without-change", path: issue.file, message: issue.message };
  }
  const named = leftOutNeeded(issue, step, leftOut, runFiles);
  if (named === undefined) {
    // Nothing left out explains it; say what fails to load.
    return { kind: "invalid-without-change", path: issue.file, message: issue.message };
  }
  const reason: LeftOutReason = named.reason;
  return { kind: "needs-left-out-change", path: named.path, leftOut: reason };
}

/**
 * The left-out file an error in another file most likely needs, the first
 * found of: a file of a kind the error's code names that `step` reads; one
 * of that kind anywhere in the run; any file `step` reads; the run's
 * first. So with two left-out agents, the step blames the one it calls.
 */
function leftOutNeeded(
  issue: WorkspaceIssue,
  step: string | null,
  leftOut: readonly LeftOutFile[],
  runFiles: RunFiles,
): LeftOutFile | undefined {
  const kinds = missingKinds[issue.code] ?? [];
  const stepFiles = step === null ? undefined : runFiles.byStep.get(step);
  const ofKind = (file: LeftOutFile) => kinds.includes(placeOf(file.path)?.kind ?? "workspace");
  const readByStep = (file: LeftOutFile) => stepFiles?.has(file.path) ?? false;
  const choices = [(file: LeftOutFile) => ofKind(file) && readByStep(file), ofKind, readByStep];
  for (const choice of choices) {
    const found = leftOut.find(choice);
    if (found !== undefined) {
      return found;
    }
  }
  return leftOut[0];
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

/**
 * Whether `issue` is in a setting no run reads: the Build assistant's own
 * model in `workspace.yaml`. Runs don't refuse to start on it, so it
 * mustn't stop every step being tried.
 */
function readByNoRun(issue: WorkspaceIssue): boolean {
  return placeOf(issue.file)?.kind === "workspace" && issue.path[0] === "assistant";
}

function isError(issue: WorkspaceIssue): boolean {
  return issue.severity === "error";
}

/** What tells one issue from another across the two loads; the line moves with the text, so it isn't part. */
function issueKey(issue: WorkspaceIssue): string {
  return JSON.stringify([issue.file, issue.code, issue.path]);
}
