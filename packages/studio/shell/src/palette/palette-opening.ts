import { useCallback, useState } from "react";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import { usePaletteKey } from "./shell-palette.tsx";

/** Whether the Ctrl K palette is open, and the two ways to change that. */
export interface PaletteOpening {
  readonly open: boolean;
  /** Opens the palette. The same function each render, so it can go straight into props. */
  readonly show: () => void;
  /** Closes the palette: `ShellPalette`'s `onClose`. */
  readonly close: () => void;
}

/**
 * Keeps whether the window's Ctrl K palette is open, and opens it on Mod K (`usePaletteKey`). The
 * frame passes `show` to everything else that opens it (component specs 24.3, UX 1.2 and 1.3): the
 * sidebar's Search box, and **+** and Ctrl T, which open a new tab on Home with the palette over it.
 *
 * @example
 * const palette = usePaletteOpening(platform);
 * useWindowKeys({ host, platform, tabs, toasts, onNewTab: palette.show });
 * <WindowTabStrip tabs={tabs} onNewTab={palette.show} />
 * <SidebarSearch platform={platform} onOpen={palette.show} />
 * {palette.open ? <ShellPalette … onClose={palette.close} /> : null}
 */
export function usePaletteOpening(platform: KeyboardPlatform): PaletteOpening {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  usePaletteKey(platform, show);
  return { open, show, close };
}
