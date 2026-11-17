import type { ChangedFile, ChangesList, DiscardOutcome } from "./changes-list.ts";

/**
 * Puts every file of an item back, one after the other, and gives one `undo` for all of them. When
 * a file can't go back the rest stay as they are and the outcome says why; the files already put
 * back keep the copy Halonic made, and the caller asks again for the one that failed.
 */
export async function discardItem(
  list: ChangesList,
  files: readonly ChangedFile[],
): Promise<DiscardOutcome> {
  const undos: Array<() => Promise<string | undefined>> = [];
  for (const file of files) {
    const outcome = await list.discardFile(file);
    if (outcome.kind === "failed") return outcome;
    undos.push(outcome.undo);
  }
  return {
    kind: "undone",
    undo: async () => {
      for (const undo of undos) {
        const reason = await undo();
        if (reason !== undefined) return reason;
      }
      return undefined;
    },
  };
}
