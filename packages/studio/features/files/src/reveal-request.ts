/**
 * A request to show one path in the file tree, made by another feature, such as the Library's
 * "Open the docs folder" (requirement `files.tree.reveal-request`). The feature shows the Files
 * view first, which loads and lists a moment later, so the request waits until the tree takes it.
 */
/**
 * What the tree did with a request: `shown` when the path's own row is in the tree and has the
 * focus, `nearest` when the tree showed the deepest folder above it or its first row instead, and
 * `dropped` when the tree took no request, because the path pointed outside the workspace folder
 * or a later request replaced it.
 */
export type FilesRevealAnswer = "shown" | "nearest" | "dropped";

/** The tree's half of the answer: it never drops a request it takes. */
export type FilesRevealTaken = Exclude<FilesRevealAnswer, "dropped">;

interface PendingReveal {
  readonly path: string;
  readonly answer: (answer: FilesRevealAnswer) => void;
}

let pending: PendingReveal | undefined;
const listeners = new Set<() => void>();

/**
 * Asks the file tree to open the folders down to `path` and focus its row, now or once the tree
 * is listed; the latest request wins. `path` is read from the workspace folder, such as
 * `hubs/reports/docs`. An absolute path, or one that steps up with `..`, asks for nothing.
 *
 * @returns what the tree did, once it took the request, so the asker can say why the path itself
 *   isn't shown; a request the tree never takes, because it is never listed, never answers
 */
export function requestFilesReveal(path: string): Promise<FilesRevealAnswer> {
  const inside = workspacePath(path);
  if (inside === undefined) return Promise.resolve("dropped");
  pending?.answer("dropped");
  const { promise, resolve } = Promise.withResolvers<FilesRevealAnswer>();
  pending = { path: inside, answer: resolve };
  for (const listener of listeners) listener();
  return promise;
}

/**
 * Calls `onRequest` with the waiting request, if there is one, and with each later one; returns
 * the way to stop. A request goes to one listener only, and what `onRequest` returns is the
 * request's answer.
 */
export function takeFilesRevealRequests(onRequest: (path: string) => FilesRevealTaken): () => void {
  const take = () => {
    if (pending === undefined) return;
    const { path, answer } = pending;
    pending = undefined;
    answer(onRequest(path));
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
