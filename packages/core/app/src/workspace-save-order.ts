type Entry = [string, string | null];

/**
 * Puts a delete before the write of a path that differs from it only in case.
 * On a disk that ignores case both are one file, so writing first and
 * deleting after would delete the new text.
 */
function deletesFirstOnSameName(entries: Entry[]): Entry[] {
  const written = new Set(
    entries.filter(([, text]) => text !== null).map(([p]) => p.toLowerCase()),
  );
  const first = (path: string, text: string | null) =>
    text === null && written.has(path.toLowerCase());
  return [
    ...entries.filter(([path, text]) => first(path, text)),
    ...entries.filter(([path, text]) => !first(path, text)),
  ];
}

/**
 * Moves the delete of a renamed file behind the write of its new file, so the
 * delete knows whether that write was held. A rename that only changes the case
 * keeps its order: both names are one file, so the delete must come first. So does
 * any delete that {@link deletesFirstOnSameName} put in front of a write in another case.
 */
function renameDeletesLast(entries: Entry[], moves: ReadonlyMap<string, unknown>): Entry[] {
  const written = new Set(
    entries.filter(([, text]) => text !== null).map(([path]) => path.toLowerCase()),
  );
  const last = ([path, text]: Entry) =>
    text === null && moves.has(path) && !written.has(path.toLowerCase());
  return [...entries.filter((entry) => !last(entry)), ...entries.filter(last)];
}

/** The order a save writes and deletes in; `moves` holds the old paths of renamed files. */
export function saveOrder(entries: Entry[], moves: ReadonlyMap<string, unknown>): Entry[] {
  return renameDeletesLast(deletesFirstOnSameName(entries), moves);
}
