import type { ReactNode } from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";
import type { PanelWindowState } from "../panels/panel-window.ts";
import { PanelWindowSlot } from "../panels/panel-window-slot.tsx";
import type { PanelWindowContribution } from "../points/frame.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import { PanelWindowButton } from "../title-bar/panel-window-button.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";

/** What {@link windowPanelParts} needs from the window. */
export interface WindowPanelOptions {
  /** The panel windows features added, in order: the window draws the first. */
  readonly panels: readonly Registered<PanelWindowContribution>[];
  readonly state: PanelWindowState;
  readonly platform: KeyboardPlatform;
  readonly closeStack: CloseStack;
  readonly contextFor: (featureId: string) => WorkspaceContext;
}

/** The side panel's two parts for the frame: its title bar button and, while open, the panel. */
export interface WindowPanelParts {
  /** At the title bar's right end; `null` while no feature adds a panel. */
  readonly button: ReactNode;
  /** For the frame's `panel`; `null` while it is closed or no feature adds one. */
  readonly slot: ReactNode;
}

/**
 * The window's side panel (`shell.panel-window`): the first panel window by `order`, with its
 * title bar button, and the panel itself while it is open. With no panel window there's neither.
 */
export function windowPanelParts(options: WindowPanelOptions): WindowPanelParts {
  const { state } = options;
  const panel = options.panels[0];
  if (panel === undefined) {
    return { button: null, slot: null };
  }
  const button = (
    <span className="ms-auto flex shrink-0 items-center self-center pe-1">
      <PanelWindowButton
        ref={state.button}
        title={panel.title}
        keys={panel.keys}
        platform={options.platform}
        open={state.open}
        controls={state.panelId}
        onToggle={state.control.toggle}
      />
    </span>
  );
  const slot = state.open ? (
    <PanelWindowSlot
      panel={panel}
      id={state.panelId}
      context={options.contextFor(panel.featureId)}
      closeStack={options.closeStack}
      onClose={state.control.hide}
    />
  ) : null;
  return { button, slot };
}
