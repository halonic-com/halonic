import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioWindow, type StudioWindowProps } from "./studio-window.tsx";

/** A Studio window drawn into a page by {@link mountStudioWindow}. */
export interface MountedStudioWindow {
  /** Removes the window from its element. Call it once, when the workspace closes. */
  unmount(): void;
}

/**
 * Draws one {@link StudioWindow} into an element of the page (`shell.studio-mount`). The app's
 * entry calls it, so React stays inside the Studio packages and `apps/studio` only starts the
 * window. React's strict mode is on, as in every Studio page.
 *
 * @example
 * const root = document.getElementById("root");
 * const studio = mountStudioWindow(root, { shell, workspace, host: "served", platform, language: "en" });
 * // when the workspace closes:
 * studio.unmount();
 */
export function mountStudioWindow(element: Element, props: StudioWindowProps): MountedStudioWindow {
  const root = createRoot(element);
  root.render(
    <StrictMode>
      <StudioWindow {...props} />
    </StrictMode>,
  );
  return { unmount: () => root.unmount() };
}
