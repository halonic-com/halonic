import { type AttemptStep, turnStepTool } from "./attempt-step.ts";
import { inRunModels } from "./coefficients.ts";
import {
  type FailScore,
  type FeatureValues,
  type LogisticModel,
  scoreWith,
} from "./logistic-model.ts";

/** The minutes into an attempt at which the in-run detector scores it. */
export const checkpointMinutes = [3, 6, 10] as const;
export type CheckpointMinute = (typeof checkpointMinutes)[number];

const testCommand =
  /\b(vitest|jest|pnpm\s+(?:-\S+\s+)*(?:test|check)|npm\s+test|tsc\b|cargo\s+test|playwright)/;
const typecheckCommand = /\btsc\b|typecheck/;
const fileReadCommand = /\b(?:cat|head|tail|sed\s+-n\s+\S+|less)\s+([\w./@-]+\.\w+)/g;
const testFile = /(\.(test|spec)\.[tj]sx?$|__tests__\/|\.snap$)/;

/**
 * The tags the in-run detector reads at `minute` (variant-router
 * `checkpoints.tags_at`). Only steps at or before the checkpoint count, so a
 * tag never sees the rest of the attempt or its check. `existingFiles`, the
 * paths at the base commit, tells edits of existing tests from new test files.
 * Tags that have no value yet are -1.
 */
export function checkpointTags(
  steps: readonly AttemptStep[],
  minute: number,
  existingFiles?: ReadonlySet<string>,
): FeatureValues {
  const seen = steps.filter((step) => step.t <= minute * 60);
  const now = Math.max(0, ...seen.map((step) => step.t));
  const edits = seen.flatMap((step) => (step.edited ?? []).map((path) => ({ t: step.t, path })));
  const editsPerFile = tally(edits.map((edit) => edit.path));
  const readsPerFile = tally(seen.flatMap(filesRead));
  const tests = seen.filter(
    (step) => step.tool === "shell" && testCommand.test(step.command ?? ""),
  );
  const failures = tests.flatMap((step) => (step.failed === undefined ? [] : [step.failed]));
  const editedTests = [...editsPerFile.keys()].filter((path) => testFile.test(path));
  const turns = seen.filter((step) => step.tool === turnStepTool);
  return {
    steps: new Set(seen.map((step) => step.step)).size,
    elapsed_s: now,
    shell_calls: seen.filter((step) => step.tool === "shell").length,
    edited_any: edits.length > 0 ? 1 : 0,
    first_edit_t: edits.length > 0 ? Math.min(...edits.map((edit) => edit.t)) : -1,
    files_edited: editsPerFile.size,
    max_edits_same_file: Math.max(0, ...editsPerFile.values()),
    max_reads_same_file: Math.max(0, ...readsPerFile.values()),
    since_last_edit_s: edits.length > 0 ? now - Math.max(...edits.map((edit) => edit.t)) : now,
    test_runs: tests.length,
    typecheck_runs: tests.filter((step) => typecheckCommand.test(step.command ?? "")).length,
    tests_ran: tests.length > 0 ? 1 : 0,
    last_failed: failures.at(-1) ?? -1,
    failed_trend: failures.length >= 2 ? (failures.at(-1) ?? 0) - (failures[0] ?? 0) : 0,
    test_files_edited: editedTests.length,
    existing_tests_edited: existingFiles
      ? editedTests.filter((path) => existingFiles.has(path)).length
      : 0,
    snapshot_edited: editedTests.some((path) => path.endsWith(".snap")) ? 1 : 0,
    tokens_in: sum(turns.map((step) => step.tokensIn ?? 0)),
    tokens_out: sum(turns.map((step) => step.tokensOut ?? 0)),
  };
}

/**
 * Scores a running attempt at a checkpoint from the steps seen so far. Only
 * meaningful while the attempt is still running at that minute; once it has
 * stopped, use the end-of-run score.
 */
export function scoreRunningAttempt(
  steps: readonly AttemptStep[],
  minute: CheckpointMinute,
  existingFiles?: ReadonlySet<string>,
  models: Readonly<Record<CheckpointMinute, LogisticModel>> = inRunModels,
): FailScore {
  return scoreWith(models[minute], checkpointTags(steps, minute, existingFiles));
}

function filesRead(step: AttemptStep): string[] {
  const fromCommand = [...(step.command ?? "").matchAll(fileReadCommand)].map(
    (match) => match[1] ?? "",
  );
  return [...(step.read ?? []), ...fromCommand];
}

function tally(items: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
