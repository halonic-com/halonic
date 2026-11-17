import type { ChangedFile, ChangesList, DiscardOutcome } from "./changes-list.ts";

/**
 * Puts every file of an item back, one after the other, and gives one `undo` for all of them. When
 * a file can't go back, the files already put back are undone again, so the item is left as it was
 * and no discard is left without its Undo; the outcome says why the file failed.
 */
export async function discardItem(
  list: ChangesList,
  files: readonly ChangedFile[],
): Promise<DiscardOutcome> {
  const undos: Array<() => Promise<string | undefined>> = [];
  for (const file of files) {
    const outcome = await list.discardFile(file);
    if (outcome.kind === "failed") {
      const rollbackFailure = await runUndos(undos);
      return rollbackFailure === undefined
        ? outcome
        : { kind: "failed", reason: `${outcome.reason} ${rollbackFailure}` };
    }
    undos.push(outcome.undo);
  }
  return {
    kind: "undone",
    undo: () => runUndos(undos),
  };
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
