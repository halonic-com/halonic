// Accept and Reject of whole files in a run proposal (HAL-3248): what each
// file's Accept writes, the trust check before it, and the undo step after.
// Internal to `core/app`; `RunProposals` calls these in the run's turn.

import {
  type DefinitionStore,
  type Digest,
  type ExpectedContent,
  segmentAsOpened,
} from "@halonicjs/ports";
import { contentDigest, matchesExpected } from "@halonicjs/std";
import { isNeverWritten, refused, storeRefusing } from "./review-gate.ts";
import type { Trash } from "./review-types.ts";
import type { PartlyDecided, ProposedRecord } from "./run-proposal-record.ts";
import type { ProposalReader, ProposalTexts } from "./run-proposal-texts.ts";
import type {
  AcceptResult,
  Decision,
  ProposalCompareChoice,
  ProposedFile,
  RefusalReason,
  UndoFileWrite,
} from "./run-proposal-types.ts";
import { CannotCombineError, compareTexts } from "./workspace-compare.ts";

/** What deciding a proposal needs from the host. */
export interface DecideContext {
  /** Where the runs' texts are. */
  readonly texts: ProposalTexts;
  /** The workspace's files. */
  readonly store: DefinitionStore;
  readonly digest: Digest;
  /** Where Accept of a file the run deleted moves it, so it can come back. */
  readonly trash: Trash;
}

/** What accepting one file did. */
export type AcceptedFile =
  /** Written, or already as the run left it: `write` is `null` then. */
  | { readonly kind: "accepted"; readonly write: UndoFileWrite | null }
  | { readonly kind: "changed-on-disk" }
  | { readonly kind: "refused"; readonly why: RefusalReason };

/**
 * Accepts one file of a proposal: writes the run's text, or moves the file
 * to the trash for a delete, only while the saved file is still the run's
 * base. A file already as the run left it is accepted without a write. Of
 * a partly decided file, what is left of the run's text is written, while
 * the saved file is as the last accepted part left it.
 *
 * @param reader - the proposal's texts
 */
export async function acceptFile(
  context: DecideContext,
  file: ProposedFile,
  reader: ProposalReader,
  partly?: PartlyDecided,
): Promise<AcceptedFile> {
  const why = refusalOf(file.path);
  if (why !== null) {
    return { kind: "refused", why };
  }
  const saved = await storeRefusing(() => context.store.read(file.path));
  if (saved === refused) {
    return { kind: "refused", why: "outside-workspace" };
  }
  const run = partly?.run ?? (await reader.read("run", file.path));
  if (saved === run) {
    return { kind: "accepted", write: null };
  }
  const expected = partly?.saved ?? expectedOf(file);
  if (!(await matchesExpected(saved, expected, context.digest))) {
    return { kind: "changed-on-disk" };
  }
  const outcome = await putFile(context, file.path, run, expected);
  if (outcome === refused) {
    return { kind: "refused", why: "outside-workspace" };
  }
  return outcome === "changed-on-disk"
    ? { kind: "changed-on-disk" }
    : { kind: "accepted", write: { path: file.path, before: saved, after: run } };
}

/** A choice made in Compare for one file, with what it is made from. */
export interface ChosenFile {
  readonly file: ProposedFile;
  readonly reader: ProposalReader;
  /** The run's text, less what the person rejected of it; `null` for a delete. */
  readonly run: string | null;
  readonly choice: ProposalCompareChoice;
  /** What Compare showed of the saved file: its digest, or `absent`. */
  readonly seen: ExpectedContent;
}

/**
 * Accepts one file the person changed since the run's base with their
 * Compare choice: writes the run's text, or both put together, only while
 * the saved file still holds what Compare showed. Trust rule A holds as
 * for {@link acceptFile}.
 *
 * @throws CannotCombineError for `combine-both` when the texts change the same lines
 */
export async function chooseFile(
  context: DecideContext,
  chosen: ChosenFile,
): Promise<AcceptedFile> {
  const { file, run, seen } = chosen;
  const why = refusalOf(file.path);
  if (why !== null) {
    return { kind: "refused", why };
  }
  const saved = await storeRefusing(() => context.store.read(file.path));
  if (saved === refused) {
    return { kind: "refused", why: "outside-workspace" };
  }
  if (!(await matchesExpected(saved, seen, context.digest))) {
    return { kind: "changed-on-disk" };
  }
  const text = chosen.choice === "use-run" ? run : await combinedOf(chosen, saved);
  if (saved === text) {
    return { kind: "accepted", write: null };
  }
  const outcome = await putFile(context, file.path, text, seen);
  if (outcome === refused) {
    return { kind: "refused", why: "outside-workspace" };
  }
  return outcome === "changed-on-disk"
    ? { kind: "changed-on-disk" }
    : { kind: "accepted", write: { path: file.path, before: saved, after: text } };
}

/**
 * The saved text and the run's put together over the run's base, as
 * Compare's Combine both.
 *
 * @throws CannotCombineError when one is a delete, or they change the same lines
 */
async function combinedOf(chosen: ChosenFile, saved: string | null): Promise<string> {
  const { path } = chosen.file;
  const base = await chosen.reader.read("base", path);
  const text = compareTexts(path, base, saved, chosen.run).combined;
  if (text === null) {
    throw new CannotCombineError(path);
  }
  return text;
}

/**
 * Puts a file back as it was `to` one side of a write, if it is still as
 * the other side left it (Undo and Redo). Gives `false` when it changed
 * since, and writes nothing then.
 */
export async function restoreFile(
  context: DecideContext,
  write: UndoFileWrite,
  to: "before" | "after",
): Promise<boolean> {
  const from = to === "before" ? write.after : write.before;
  const expected: ExpectedContent =
    from === null ? "absent" : await contentDigest(from, context.digest);
  const outcome = await putFile(context, write.path, write[to], expected);
  return outcome === "written";
}

/**
 * Writes `content`, or moves the file to the trash for `null`, only if the
 * file still holds `expected`. `refused` when the store won't serve the
 * path, such as one through a symlink.
 */
async function putFile(
  context: DecideContext,
  path: string,
  content: string | null,
  expected: ExpectedContent,
): Promise<"written" | "changed-on-disk" | typeof refused> {
  if (content !== null) {
    const written = await storeRefusing(() => context.store.write(path, content, { expected }));
    return written === refused ? refused : written.status;
  }
  if (expected === "absent") {
    // Nothing to delete, and nothing there: already as asked.
    const current = await storeRefusing(() => context.store.read(path));
    if (current === refused) {
      return refused;
    }
    return current === null ? "written" : "changed-on-disk";
  }
  const moved = await storeRefusing(() => context.trash.moveToTrash(path, expected));
  if (moved === refused) {
    return refused;
  }
  return moved.status === "done" ? "written" : "changed-on-disk";
}

/** What Accept expects the saved file to hold: the run's base. */
export function expectedOf(file: ProposedFile): ExpectedContent {
  return file.base === "absent" ? "absent" : file.base.digest;
}

/**
 * Why Accept may never write a path (`app.run-proposal-trust`, rule A), or
 * `null` when it may: a segment that opens as `.git` or `.halonic` on
 * Windows or macOS, or any other path the assistant may never write
 * (unsafe or private), which can't be a workspace file.
 */
export function refusalOf(path: string): RefusalReason | null {
  if (!isNeverWritten(path)) {
    return null;
  }
  const segments = path.split("/").map(segmentAsOpened);
  if (segments.includes(".git")) {
    return "under-git";
  }
  if (segments.includes(".halonic")) {
    return "under-halonic";
  }
  return "outside-workspace";
}

/** What accepting some files of a proposal did, before the record is saved. */
export interface AcceptedFiles {
  /** Every file's decision afterwards. */
  readonly decisions: Readonly<Record<string, Decision>>;
  /** The files written, in path order. */
  readonly writes: readonly UndoFileWrite[];
  readonly changedOnDisk: readonly string[];
  readonly refused: AcceptResult["refused"];
}

/**
 * Accepts each undecided file of `files`, one at a time, each with its own
 * `expected`: a file that changes between the check and the write is
 * listed in `changedOnDisk` and the others are still written. A refused
 * file becomes `not-applicable` and stays in the proposal.
 */
export async function acceptFiles(
  context: DecideContext,
  record: ProposedRecord,
  files: readonly ProposedFile[],
  reader: ProposalReader,
): Promise<AcceptedFiles> {
  const decisions: Record<string, Decision> = { ...record.decisions };
  const writes: UndoFileWrite[] = [];
  const changedOnDisk: string[] = [];
  const refusedFiles: { path: string; why: RefusalReason }[] = [];
  for (const file of files) {
    if (decisions[file.path] !== "undecided") {
      continue;
    }
    const outcome = await acceptFile(context, file, reader, record.partly?.[file.path]);
    if (outcome.kind === "changed-on-disk") {
      changedOnDisk.push(file.path);
    } else if (outcome.kind === "refused") {
      decisions[file.path] = "not-applicable";
      refusedFiles.push({ path: file.path, why: outcome.why });
    } else {
      decisions[file.path] = "accepted";
      if (outcome.write !== null) {
        writes.push(outcome.write);
      }
    }
  }
  return { decisions, writes, changedOnDisk, refused: refusedFiles };
}
