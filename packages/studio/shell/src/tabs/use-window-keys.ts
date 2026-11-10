import { isComposing, type ToastStore } from "@halonicjs/studio-kit";
import { useEffect } from "react";
import type { StudioHost } from "../engine/engine-words.ts";
import { isModalDialogOpen } from "../frame/frame-effects.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { TabSet, WindowTab } from "./tab-set.ts";
import { type WindowKey, windowKeyFor } from "./window-keys.ts";

/** What {@link useWindowKeys} acts on. */
export interface WindowKeysOptions {
  /** Where this Studio runs. Only the desktop app binds the keys. */
  readonly host: StudioHost;
  /** Decides whether `Mod` is Cmd (macOS) or Ctrl. */
  readonly platform: KeyboardPlatform;
  /** The open workspace's tabs. */
  readonly tabs: TabSet;
  /** The window's toasts, for F6. */
  readonly toasts: ToastStore;
  /** Called with the tab Ctrl T opened, as **+** does, so the frame can open Ctrl K there. */
  readonly onNewTab?: ((tab: WindowTab) => void) | undefined;
}

/**
 * Binds the window-wide keys of the desktop app (UX checklist part 1, 1.2 and 1.5, kit 23.1): Ctrl T,
 * Ctrl W, Ctrl Shift T, Ctrl Tab, Ctrl 1–9 and F6 (Cmd for Ctrl on macOS, except Ctrl Tab). In a
 * browser these keys belong to the browser, so served Studio binds none of them; **+**, ✕ and the
 * tab menu do the same there.
 *
 * A key is left alone while a modal dialog is open, while an input method composes, and when a part
 * of the page has already handled it. A key it uses is marked handled with `preventDefault()`.
 *
 * @example
 * useWindowKeys({ host: "desktop-app", platform: "windows", tabs: workspace.tabs, toasts: shell.toasts });
 */
export function useWindowKeys(options: WindowKeysOptions): void {
  const { host, platform, tabs, toasts, onNewTab } = options;
  useEffect(() => {
    if (host !== "desktop-app") {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isComposing(event) || isModalDialogOpen()) {
        return;
      }
      const windowKey = windowKeyFor(event, platform);
      if (windowKey !== undefined) {
        event.preventDefault();
        run(windowKey, tabs, toasts, onNewTab);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [host, platform, tabs, toasts, onNewTab]);
}

function run(
  windowKey: WindowKey,
  tabs: TabSet,
  toasts: ToastStore,
  onNewTab: WindowKeysOptions["onNewTab"],
): void {
  switch (windowKey.kind) {
    case "new-tab":
      onNewTab?.(tabs.newTab());
      return;
    case "close-tab":
      tabs.close(tabs.state.activeId);
      return;
    case "reopen-closed-tab":
      tabs.reopenClosed();
      return;
    case "cycle-tabs":
      tabs.cycle(windowKey.step);
      return;
    case "activate-tab":
      tabs.activateAt(windowKey.index);
      return;
    case "focus-toasts":
      toasts.focus();
      return;
  }
}
