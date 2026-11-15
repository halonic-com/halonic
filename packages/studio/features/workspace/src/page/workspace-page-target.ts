/** The sections of the workspace page a command can open it at. */
export type WorkspacePageTarget = "trust" | "models";

type Listener = () => void;

let pending: WorkspacePageTarget | undefined;
const listeners = new Set<Listener>();

/** Asks the workspace page to scroll to a section and focus its heading, as soon as it is drawn. */
export function requestWorkspaceTarget(target: WorkspacePageTarget): void {
  pending = target;
  for (const listener of [...listeners]) listener();
}

/** Takes the pending target, so each request moves focus once. */
export function takeWorkspaceTarget(): WorkspacePageTarget | undefined {
  const target = pending;
  pending = undefined;
  return target;
}

/** Calls `listener` when a target is requested while the page is already open. Returns the stop. */
export function onWorkspaceTarget(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The attribute a section carries so the page can find it: `data-workspace-section="models"`. */
export const WORKSPACE_SECTION_ATTRIBUTE = "data-workspace-section";
