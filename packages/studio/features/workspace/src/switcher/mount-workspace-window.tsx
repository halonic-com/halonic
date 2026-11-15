import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceWindow, type WorkspaceWindowProps } from "./workspace-window.tsx";

/** A {@link WorkspaceWindow} drawn into a page by {@link mountWorkspaceWindow}. */
export interface MountedWorkspaceWindow {
  /** Removes the window from its element. Call it once, when the page goes. */
  unmount(): void;
  /** Draws the window again with other props, keeping what it holds (tabs, open dialogs). */
  update(props: WorkspaceWindowProps): void;
}

/**
 * Draws the desktop app's {@link WorkspaceWindow} into an element of the page, in React's strict
 * mode as every Studio page, so React stays inside the Studio packages and `apps/studio` only
 * starts the window.
 *
 * @example
 * const window = mountWorkspaceWindow(root, { shell, switcher, platform, language: "en" });
 * // when the page goes:
 * window.unmount();
 */
export function mountWorkspaceWindow(
  element: Element,
  props: WorkspaceWindowProps,
): MountedWorkspaceWindow {
  const root = createRoot(element);
  const render = (shown: WorkspaceWindowProps) =>
    root.render(
      <StrictMode>
        <WorkspaceWindow {...shown} />
      </StrictMode>,
    );
  render(props);
  return { unmount: () => root.unmount(), update: render };
}
