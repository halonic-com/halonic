/**
 * A request to open a file with the cursor on one line, made by another feature: a broken file's
 * row opens its file at the first problem (requirement `files.open-at-line`, C348). The file's tab
 * takes it once its editor is ready, or at once when it already is; for one file, the latest
 * request wins.
 */
const pending = new Map<string, number>();
const listeners = new Set<() => void>();

/**
 * Asks the tab of `path` to put the cursor on `line` (1-based) and focus its editor. Open the
 * file's tab with `fileItem(path)` after it.
 *
 * @example
 * requestOpenAtLine("hubs/support/agents/writer.agent.yaml", 2);
 * openItem(fileItem("hubs/support/agents/writer.agent.yaml"));
 */
export function requestOpenAtLine(path: string, line: number): void {
  pending.set(path, line);
  for (const listener of listeners) listener();
}

/**
 * Calls `onLine` with the waiting request for `path`, if there is one, and with each later one;
 * returns the way to stop. A request goes to one listener only.
 */
export function takeOpenAtLineRequests(path: string, onLine: (line: number) => void): () => void {
  const take = () => {
    const line = pending.get(path);
    if (line === undefined) return;
    pending.delete(path);
    onLine(line);
  };
  listeners.add(take);
  take();
  return () => listeners.delete(take);
}
