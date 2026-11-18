const waiting = new Set<string>();

/**
 * Notes that a file's tab should put the cursor in its editor when it opens: the user just made
 * the file, so the next thing they do is type in it.
 */
export function askFocusOnOpen(path: string): void {
  waiting.add(path);
}

/** Whether the file's tab was asked to take focus. Answers `true` once per ask. */
export function takeFocusOnOpen(path: string): boolean {
  return waiting.delete(path);
}
