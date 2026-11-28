import {
  type OpenExternal,
  OpenExternalProvider,
  type OpenExternalProviderProps,
  openInNewTab,
} from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceWindow, type WorkspaceWindowProps } from "./workspace-window.tsx";

/** The kit's sign-in opener (`kit.open-sign-in`), read off the provider's props: `index.ts` is at its size limit. */
type OpenSignIn = NonNullable<OpenExternalProviderProps["openSignIn"]>;

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
 * starts the window. Every outside link in it opens its page with `openExternal`: the desktop
 * app's own, or a new browser tab when it gives none. A sign-in page opens with `openSignIn`, the
 * desktop app's small browser window over Studio, or with `openExternal` when it gives none
 * (`kit.open-sign-in`).
 *
 * @example
 * const window = mountWorkspaceWindow(root, { shell, switcher, platform, language: "en" });
 * // when the page goes:
 * window.unmount();
 */
export function mountWorkspaceWindow(
  element: Element,
  props: WorkspaceWindowProps,
  openExternal: OpenExternal = openInNewTab,
  openSignIn: OpenSignIn = (address) => openExternal(address),
): MountedWorkspaceWindow {
  const root = createRoot(element);
  const render = (shown: WorkspaceWindowProps) =>
    root.render(
      <StrictMode>
        <OpenExternalProvider openExternal={openExternal} openSignIn={openSignIn}>
          <WorkspaceWindow {...shown} />
        </OpenExternalProvider>
      </StrictMode>,
    );
  render(props);
  return { unmount: () => root.unmount(), update: render };
}
