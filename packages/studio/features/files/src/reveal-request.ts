/**
 * A request to show one path in the file tree, made by another feature, such as the Library's
 * "Open the docs folder" (requirement `files.tree.reveal-request`). The feature shows the Files
 * view first, which loads and lists a moment later, so the request waits until the tree takes it.
 */
let pending: string | undefined;
const listeners = new Set<() => void>();

/**
 * Asks the file tree to open the folders down to `path` and focus its row, now or once the tree
 * is listed; the latest request wins. `path` is read from the workspace folder, such as
 * `hubs/reports/docs`. An absolute path, or one that steps up with `..`, asks for nothing.
 */
export function requestFilesReveal(path: string): void {
  const inside = workspacePath(path);
  if (inside === undefined) return;
  pending = inside;
  for (const listener of listeners) listener();
}

/**
 * Calls `onRequest` with the waiting request, if there is one, and with each later one; returns
 * the way to stop. A request goes to one listener only.
 */
export function takeFilesRevealRequests(onRequest: (path: string) => void): () => void {
  const take = () => {
    if (pending === undefined) return;
    const path = pending;
    pending = undefined;
    onRequest(path);
  };
  listeners.add(take);
  take();
  return () => listeners.delete(take);
}

/**
 * The path as the tree names it, such as `hubs/p/docs` for `./hubs//p/docs/`, or `undefined` for
 * one that could point outside the workspace folder: absolute, with a drive, or stepping up.
 * The workspace folder itself is `""`.
 */
export function workspacePath(path: string): string | undefined {
  if (path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path)) return undefined;
  const segments = path.split(/[/\\]/).filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) return undefined;
  return segments.join("/");
}
