/**
 * A request to open the New routine dialog on the Routines page, made by Ctrl K's **New routine**
 * command. The command can run before the page is drawn, so the request waits until the page
 * takes it.
 */
let pending = false;
const listeners = new Set<() => void>();

/** Asks the Routines page to open its New routine dialog, now or when it is drawn. */
export function requestNewRoutine(): void {
  pending = true;
  for (const listener of listeners) listener();
}

/**
 * Calls `onRequest` for the waiting request, if there is one, and for each later one; returns the
 * way to stop. A request goes to one listener only.
 */
export function takeNewRoutineRequests(onRequest: () => void): () => void {
  const take = () => {
    if (!pending) return;
    pending = false;
    onRequest();
  };
  listeners.add(take);
  take();
  return () => listeners.delete(take);
}

/** Forgets a waiting request, for a page that can't open the dialog. */
export function dropNewRoutineRequest(): void {
  pending = false;
}
