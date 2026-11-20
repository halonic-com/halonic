import type { ChangedFile, ChangesList, DiscardOutcome } from "./changes-list.ts";
import { discardWords } from "./changes-words.ts";

/** A file put back, and what puts it as it was. */
export interface Done {
  readonly path: string;
  readonly undo: () => Promise<string | undefined>;
}

/**
 * Puts every file of an item back, one after the other, and gives one `undo` for all of them.
 * When a file can't go back, the files already put back are undone again, so the item is left
 * as it was and no discard is left without its Undo (also a file that went back without a copy);
 * the outcome says why the file failed. When the roll-back fails too, the outcome is `partial`
 * and names the files not put back as they were. When a copy can't be kept the outcome is
 * `noCopy`, and `withoutCopy` goes on anyway, with nothing to undo.
 */
export async function discardItem(
  list: ChangesList,
  files: readonly ChangedFile[],
  options: { readonly withoutCopy?: boolean } = {},
): Promise<DiscardOutcome> {
  const done: Done[] = [];
  let copiesKept = true;
  for (const file of files) {
    const outcome = await list.discardFile(file, options);
    if (outcome.kind === "failed" || outcome.kind === "noCopy") {
      const reason = outcome.kind === "failed" ? outcome.reason : discardWords.noCopy;
      const rollback = await runUndos(done);
      if (rollback === undefined) return outcome;
      return { kind: "partial", reason: `${reason} ${rollback.reason}`, paths: rollback.paths };
    }
    if (outcome.kind === "discarded") {
      copiesKept = false;
      done.push({ path: file.path, undo: outcome.putBack });
    } else if (outcome.kind === "undone") {
      done.push({ path: file.path, undo: outcome.undo });
    }
  }
  const undoAll = async () => (await runUndos(done))?.reason;
  return copiesKept ? { kind: "undone", undo: undoAll } : { kind: "discarded", putBack: undoAll };
}

/**
 * Runs the undos, the last discard first; stops at the first one that fails and gives its reason
 * and the files from there on, which are not as they were. Gives `undefined` when all worked.
 */
export async function runUndos(
  done: readonly Done[],
): Promise<{ readonly reason: string; readonly paths: readonly string[] } | undefined> {
  const newestFirst = [...done].reverse();
  for (const [index, entry] of newestFirst.entries()) {
    const reason = await entry.undo();
    if (reason !== undefined) {
      return { reason, paths: newestFirst.slice(index).map((rest) => rest.path) };
    }
  }
  return undefined;
}
