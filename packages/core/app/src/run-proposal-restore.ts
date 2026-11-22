// Undo and Redo of a run proposal's step (HAL-3248), file by file
// (HAL-16083): the files come back first, then only the decisions of the
// files that came back. A file left alone keeps its decision, so the record
// still says what the file holds. Internal to `core/app`;
// `ProposalDecisions.restore` calls these in the run's turn.

import { refused, storeRefusing } from "./review-gate.ts";
import { type DecideContext, refusalOf, restoreFile } from "./run-proposal-decide.ts";
import {
  type PartlyDecided,
  type ProposedRecord,
  parseRunProposalRecord,
} from "./run-proposal-record.ts";
import type { Decision, RefusalReason, UndoFileWrite } from "./run-proposal-types.ts";

/** The decisions record as a step found it and as it left it. */
export interface RecordSides {
  readonly before: ProposedRecord;
  readonly after: ProposedRecord;
}

/** What restoring a step's files did. */
export interface FilesRestored {
  /** Files left alone because they changed since the step. */
  readonly changedOnDisk: readonly string[];
  /** Files that may never be written, as for Accept. */
  readonly refused: readonly { readonly path: string; readonly why: RefusalReason }[];
}

/** The decisions and partly decided files to save after a restore. */
export interface Standing {
  readonly decisions: Readonly<Record<string, Decision>>;
  readonly partly: Readonly<Record<string, PartlyDecided>>;
}

/**
 * Reads both sides of a step's decisions record entry.
 *
 * @returns `null` when either side isn't a proposed record of the run: the
 *   host keeps the steps it gives out, so only a crafted step has one
 */
export function recordSidesOf(entry: UndoFileWrite, runId: string): RecordSides | null {
  const before = proposedOf(entry.before, runId);
  const after = proposedOf(entry.after, runId);
  return before === null || after === null ? null : { before, after };
}

function proposedOf(text: string | null, runId: string): ProposedRecord | null {
  if (text === null) {
    return null;
  }
  const parsed = parseRunProposalRecord(text, runId);
  return parsed.ok && parsed.value.state === "proposed" ? parsed.value : null;
}

/** The files whose decision, or where they partly stand, the step changed. */
export function filesDecidedIn(sides: RecordSides): readonly string[] {
  const paths = new Set([
    ...Object.keys(sides.before.decisions),
    ...Object.keys(sides.after.decisions),
  ]);
  return [...paths].filter((path) => !sameStanding(sides.before, sides.after, path));
}

/**
 * Whether the step's own files may be restored to `to`: each still stands
 * as the step left it, or already as `to` has it (a file an earlier,
 * partial Undo or Redo left alone). A later decision on another file of the
 * run doesn't count, as that decision stays as it is. A file the run
 * doesn't propose, which only a crafted step names, never counts as left.
 */
export function stillAsLeft(
  current: ProposedRecord,
  sides: RecordSides,
  to: "before" | "after",
): boolean {
  const left = to === "before" ? sides.after : sides.before;
  return filesDecidedIn(sides).every(
    (path) =>
      current.decisions[path] !== undefined &&
      (sameStanding(current, left, path) || sameStanding(current, sides[to], path)),
  );
}

/**
 * The current decisions with each of `paths` set as `side` has it, and
 * every other file as it is.
 */
export function standingWith(
  current: ProposedRecord,
  side: ProposedRecord,
  paths: readonly string[],
): Standing {
  const decisions: Record<string, Decision> = { ...current.decisions };
  const partly: Record<string, PartlyDecided> = { ...current.partly };
  for (const path of paths) {
    const decision = side.decisions[path];
    if (decision !== undefined) {
      decisions[path] = decision;
    }
    const sidePartly = side.partly?.[path];
    if (sidePartly === undefined) {
      delete partly[path];
    } else {
      partly[path] = sidePartly;
    }
  }
  return { decisions, partly };
}

function sameStanding(one: ProposedRecord, other: ProposedRecord, path: string): boolean {
  const onePartly = one.partly?.[path];
  const otherPartly = other.partly?.[path];
  return (
    one.decisions[path] === other.decisions[path] &&
    onePartly?.saved === otherPartly?.saved &&
    onePartly?.run === otherPartly?.run
  );
}

/**
 * Puts each of a step's files back, in order, if it still holds what the
 * step left. A step comes back from the history, which Accept didn't
 * build: trust rule A holds for each of its files as it does for Accept.
 */
export async function restoreFiles(
  context: DecideContext,
  entries: readonly UndoFileWrite[],
  to: "before" | "after",
): Promise<FilesRestored> {
  const changedOnDisk: string[] = [];
  const refusedFiles: { path: string; why: RefusalReason }[] = [];
  for (const entry of entries) {
    const why = refusalOf(entry.path);
    if (why !== null) {
      refusedFiles.push({ path: entry.path, why });
      continue;
    }
    const outcome = await restoreEntry(context, entry, to);
    if (outcome === refused) {
      refusedFiles.push({ path: entry.path, why: "outside-workspace" });
    } else if (!outcome) {
      changedOnDisk.push(entry.path);
    }
  }
  return { changedOnDisk, refused: refusedFiles };
}

/**
 * Puts one file back. A file that already holds what `to` has, as one an
 * earlier partial Undo left alone does for its Redo, counts as put back.
 */
async function restoreEntry(
  context: DecideContext,
  entry: UndoFileWrite,
  to: "before" | "after",
): Promise<boolean | typeof refused> {
  if (await restoreFile(context, entry, to)) {
    return true;
  }
  const current = await storeRefusing(() => context.store.read(entry.path));
  return current === refused ? refused : current === entry[to];
}
