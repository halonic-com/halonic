import {
  type KeyboardPlatform,
  type Shell,
  type StudioHost,
  StudioWindow,
  type StudioWorkspace,
} from "@halonicjs/studio-shell";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { PhoneWorkspaceSheet } from "./phone-workspace-sheet.tsx";
import type { LoadServedWorkspace, ServedWorkspace } from "./served-workspace.ts";

/** Props for {@link ServedWindow}. */
export interface ServedWindowProps {
  readonly shell: Shell;
  /** The open workspace, made with the name in `served` when the computer gave one. */
  readonly workspace: StudioWorkspace;
  readonly host: StudioHost;
  readonly platform: KeyboardPlatform;
  readonly language: string;
  /**
   * The workspace the computer serves. Without it (the computer didn't answer) the More page has
   * no workspace row, so there is never a row that does nothing.
   */
  readonly served?: ServedWorkspace | undefined;
  /** Asks the computer again, each time the picker sheet opens. */
  readonly load: LoadServedWorkspace;
}

/**
 * The served Studio's window: the shell's Studio window, with the phone's workspace row on More
 * opening the picker sheet (`workspace.served-picker`).
 *
 * @example
 * <ServedWindow shell={shell} workspace={workspace} host="served" platform="linux" language="en" served={facts} load={load} />
 */
export function ServedWindow({ served, load, ...window }: ServedWindowProps) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <StudioWindow
        {...window}
        phoneSwitcher={
          served === undefined
            ? undefined
            : {
                workspace: { name: served.name, folder: served.folder },
                onChange: () => setPicking(true),
              }
        }
      />
      {picking ? <PhoneWorkspaceSheet load={load} onClose={() => setPicking(false)} /> : null}
    </>
  );
}

/** A {@link ServedWindow} drawn into a page by {@link mountServedWindow}. */
export interface MountedServedWindow {
  /** Removes the window from its element. Call it once, when the page goes. */
  unmount(): void;
}

/**
 * Draws the served Studio's {@link ServedWindow} into an element of the page, in React's strict
 * mode, so React stays inside the Studio packages and `apps/studio` only starts the window.
 */
export function mountServedWindow(element: Element, props: ServedWindowProps): MountedServedWindow {
  const root = createRoot(element);
  root.render(
    <StrictMode>
      <ServedWindow {...props} />
    </StrictMode>,
  );
  return { unmount: () => root.unmount() };
}
