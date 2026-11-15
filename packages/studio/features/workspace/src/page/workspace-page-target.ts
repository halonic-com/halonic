/** The sections of the workspace page a command can open it at. */
export type WorkspacePageTarget = "trust" | "models";

type Listener = () => void;

/** How long a request waits for a page to take it, so one nothing opened can't fire much later. */
const PENDING_MS = 5000;

let pending: { target: WorkspacePageTarget; at: number } | undefined;
const listeners = new Set<Listener>();

/** Asks the workspace page to scroll to a section and focus its heading, as soon as it is drawn. */
export function requestWorkspaceTarget(target: WorkspacePageTarget): void {
  pending = { target, at: Date.now() };
  for (const listener of [...listeners]) listener();
}

/** Takes the pending target, so each request moves focus once. */
export function takeWorkspaceTarget(): WorkspacePageTarget | undefined {
  const request = pending;
  pending = undefined;
  return request !== undefined && Date.now() - request.at <= PENDING_MS
    ? request.target
    : undefined;
}

/** Calls `listener` when a target is requested while the page is already open. Returns the stop. */
export function onWorkspaceTarget(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The attribute a section carries so the page can find it: `data-workspace-section="models"`. */
export const WORKSPACE_SECTION_ATTRIBUTE = "data-workspace-section";
