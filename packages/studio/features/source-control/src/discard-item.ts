import type { ChangedFile, ChangesList, DiscardOutcome } from "./changes-list.ts";
import { discardWords } from "./changes-words.ts";

/**
 * Puts every file of an item back, one after the other, and gives one `undo` for all of them. When
 * a file can't go back, the files already put back are undone again, so the item is left as it was
 * and no discard is left without its Undo; the outcome says why the file failed. When a copy can't
 * be kept the outcome is `noCopy`, and `withoutCopy` goes on anyway, with nothing to undo.
 */
export async function discardItem(
  list: ChangesList,
  files: readonly ChangedFile[],
  options: { readonly withoutCopy?: boolean } = {},
): Promise<DiscardOutcome> {
  const undos: Array<() => Promise<string | undefined>> = [];
  let copiesKept = true;
  for (const file of files) {
    const outcome = await list.discardFile(file, options);
    if (outcome.kind === "failed" || outcome.kind === "noCopy") {
      const rollbackFailure = await runUndos(undos);
      if (rollbackFailure === undefined) return outcome;
      const reason = outcome.kind === "failed" ? outcome.reason : discardWords.noCopy;
      return { kind: "failed", reason: `${reason} ${rollbackFailure}` };
    }
    if (outcome.kind === "discarded") copiesKept = false;
    else undos.push(outcome.undo);
  }
  return copiesKept ? { kind: "undone", undo: () => runUndos(undos) } : { kind: "discarded" };
}

/** Runs the undos, the last discard first; stops at the first one that fails and gives its reason. */
async function runUndos(
  undos: readonly (() => Promise<string | undefined>)[],
): Promise<string | undefined> {
  for (const undo of [...undos].reverse()) {
    const reason = await undo();
    if (reason !== undefined) return reason;
  }
  return undefined;
}
