import type { LibraryItemKind } from "@halonicjs/app";

/**
 * A request to show one Library tab, made by the Alt+4 to Alt+7 commands. The command can run
 * before the page is drawn, so the request waits until the page takes it.
 */
let pending: LibraryItemKind | undefined;
const listeners = new Set<() => void>();

/** Asks the Library page to show `kind`, now or when it is drawn. */
export function requestLibraryTab(kind: LibraryItemKind): void {
  pending = kind;
  for (const listener of listeners) listener();
}

/**
 * Calls `onRequest` with the waiting request, if there is one, and with each later one; returns
 * the way to stop. A request goes to one listener only.
 */
export function takeLibraryTabRequests(onRequest: (kind: LibraryItemKind) => void): () => void {
  const take = () => {
    if (pending === undefined) return;
    const kind = pending;
    pending = undefined;
    onRequest(kind);
  };
  listeners.add(take);
  take();
  return () => listeners.delete(take);
}
