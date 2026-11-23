import { type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PanelWindowControl } from "../workspace-context.ts";

/** The window's side panel as the window draws it: whether it is open, and its button and id. */
export interface PanelWindowState {
  readonly open: boolean;
  /** What the context's `panelWindow` and the title bar button use; the same object every render. */
  readonly control: PanelWindowControl;
  /** The title bar button, where focus goes when the panel closes and its opener has gone. */
  readonly button: RefObject<HTMLButtonElement | null>;
  /** The panel's `id`, for the button's `aria-controls`. */
  readonly panelId: string;
}

/**
 * Whether the window's side panel is open (`shell.panel-window`). It starts closed in each window
 * and isn't saved. Opening remembers what had focus; closing gives focus back to it once the panel
 * has gone, or to the title bar button when it has gone too or is inert.
 */
export function usePanelWindow(): PanelWindowState {
  const [open, setOpen] = useState(false);
  // Read by `isOpen` and the toggles between renders, so two presses in one event can't both open.
  const isOpen = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [closings, setClosings] = useState(0);
  const panelId = useId();

  const control = useMemo<PanelWindowControl>(() => {
    const show = () => {
      if (isOpen.current) return;
      const focused = document.activeElement;
      opener.current = focused instanceof HTMLElement ? focused : null;
      isOpen.current = true;
      setOpen(true);
    };
    const hide = () => {
      if (!isOpen.current) return;
      isOpen.current = false;
      setOpen(false);
      setClosings((count) => count + 1);
    };
    return {
      isOpen: () => isOpen.current,
      show,
      hide,
      toggle: () => (isOpen.current ? hide() : show()),
    };
  }, []);

  // After the render that took the panel away, so the page it covered is no longer inert.
  useEffect(() => {
    if (closings === 0) return;
    focusBack(opener.current, button.current);
    opener.current = null;
  }, [closings]);

  return { open, control, button, panelId };
}

function focusBack(opener: HTMLElement | null, button: HTMLElement | null): void {
  const usable =
    opener !== null &&
    opener !== document.body &&
    opener.isConnected &&
    opener.closest("[inert]") === null;
  (usable ? opener : button)?.focus();
}
