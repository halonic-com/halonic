/**
 * A request to open the New workflow dialog on the Workflows page, made by Ctrl K's **New
 * workflow** command. The command can run before the page is drawn, so the request waits until the
 * page takes it.
 */
let pending = false;
const listeners = new Set<() => void>();

/** Asks the Workflows page to open its New workflow dialog, now or when it is drawn. */
export function requestNewWorkflow(): void {
  pending = true;
  for (const listener of listeners) listener();
}

/**
 * Calls `onRequest` for the waiting request, if there is one, and for each later one; returns the
 * way to stop. A request goes to one listener only.
 */
export function takeNewWorkflowRequests(onRequest: () => void): () => void {
  const take = () => {
    if (!pending) return;
    pending = false;
    onRequest();
  };
  listeners.add(take);
  take();
  return () => listeners.delete(take);
}
