/**
 * A request to open the New agent dialog on the Agents page, made by Ctrl K's **New agent**
 * command. The command can run before the page is drawn, so the request waits until the page
 * takes it.
 */
let pending = false;
const listeners = new Set<() => void>();

/** Asks the Agents page to open its New agent dialog, now or when it is drawn. */
export function requestNewAgent(): void {
  pending = true;
  for (const listener of listeners) listener();
}

/**
 * Calls `onRequest` for the waiting request, if there is one, and for each later one; returns the
 * way to stop. A request goes to one listener only.
 */
export function takeNewAgentRequests(onRequest: () => void): () => void {
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
export function dropNewAgentRequest(): void {
  pending = false;
}
