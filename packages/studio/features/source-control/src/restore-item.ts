import type { ChangesSource, KeptFile, ReplaceResult } from "./api.ts";
import { restoreWords } from "./changes-words.ts";
import { type Done, runUndos } from "./discard-item.ts";

/** What {@link restoreItem} did. */
export type RestoreOutcome =
  /** The item's files are as the version has them; `undo` puts them back and says why when it can't. */
  | { readonly kind: "restored"; readonly undo: () => Promise<string | undefined> }
  /** The item's files already were as the version has them: nothing changed. */
  | { readonly kind: "unchanged" }
  /** Nothing changed: the files already restored were put back. */
  | { readonly kind: "failed"; readonly reason: string }
  /** A file failed and so did putting the others back: `paths` are not as they were. */
  | { readonly kind: "partial"; readonly reason: string; readonly paths: readonly string[] };

/** One file of the item: as it is now, and as the version has it; `null` where it isn't there. */
interface FilePlan {
  readonly path: string;
  readonly now: string | null;
  readonly then: string | null;
}

/**
 * Restore just this (checklist part 2, 2.9): puts the item's files as the version `versionId`
 * has them, so the item becomes an ordinary change; a file the version doesn't have is deleted.
 * A copy of what is there now is kept first; when it can't be, nothing changes. When a file can't
 * be written, the files already written are put back, as Undo these changes does, and the outcome
 * says why; when that fails too, the outcome is `partial`.
 */
export async function restoreItem(
  source: ChangesSource,
  versionId: string,
  paths: readonly string[],
): Promise<RestoreOutcome> {
  let plans: FilePlan[];
  try {
    plans = await readPlans(source, versionId, paths);
  } catch (error) {
    return { kind: "failed", reason: reasonOf(error) };
  }
  if (plans.length === 0) return { kind: "unchanged" };
  const thrown = plans.flatMap((plan): KeptFile[] =>
    plan.now === null ? [] : [{ path: plan.path, text: plan.now }],
  );
  try {
    if (thrown.length > 0) await source.keepCopy(thrown);
  } catch {
    return { kind: "failed", reason: restoreWords.noCopy };
  }
  const done: Done[] = [];
  for (const plan of plans) {
    const result = await write(source, plan.path, plan.then, plan.now);
    if (result === "changed-on-disk") {
      const rollback = await runUndos(done);
      if (rollback === undefined) return { kind: "failed", reason: restoreWords.changedMeanwhile };
      const reason = `${restoreWords.changedMeanwhile} ${rollback.reason}`;
      return { kind: "partial", reason, paths: rollback.paths };
    }
    done.push({ path: plan.path, undo: () => putBack(source, plan) });
  }
  return { kind: "restored", undo: async () => (await runUndos(done))?.reason };
}

/** Each file that differs from the version, with its text now and in the version. */
async function readPlans(
  source: ChangesSource,
  versionId: string,
  paths: readonly string[],
): Promise<FilePlan[]> {
  const plans: FilePlan[] = [];
  for (const path of paths) {
    const then = await source.readAtVersion(versionId, path);
    const now = await source.readFile(path);
    if (now !== then) plans.push({ path, now, then });
  }
  return plans;
}

/** Makes the file hold `text` (deleted for `null`), only while it still holds `expected`. */
async function write(
  source: ChangesSource,
  path: string,
  text: string | null,
  expected: string | null,
): Promise<ReplaceResult> {
  if (text !== null) return source.replaceFile(path, text, expected);
  // A file neither there now nor in the version never gets a plan, so `expected` is a text here.
  if (expected === null) return "replaced";
  return source.removeFile(path, expected);
}

/** Puts one restored file back as it was; says why when it changed since. */
async function putBack(source: ChangesSource, plan: FilePlan): Promise<string | undefined> {
  const result = await write(source, plan.path, plan.now, plan.then);
  return result === "replaced" ? undefined : restoreWords.changedSince;
}

function reasonOf(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : restoreWords.cantRead;
}
