import { isComposing } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useState } from "react";
import type { StudioHost } from "../engine/engine-words.ts";
import { isModalDialogOpen } from "../frame/frame-effects.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";

/** Whether the window's Settings is open, on which section, and the ways to change that. */
export interface SettingsOpening {
  /** The opening Settings shows, counted from 1, or `undefined` while it is closed. */
  readonly opening: number | undefined;
  /** The section the opener asked for, if any. */
  readonly requested: string | undefined;
  /** The section shown when Settings last closed in this window. */
  readonly lastShown: string | undefined;
  /** `settings.open(sectionId?)`. The same function each render, so it can go into a context. */
  readonly show: (sectionId?: string) => void;
  /** `SettingsDialog`'s `onClose`. */
  readonly close: () => void;
  /** `SettingsDialog`'s `onShown`, so the next opening without a section returns there. */
  readonly remember: (sectionId: string) => void;
}

/**
 * Keeps whether the window's Settings is open (`shell.settings-window`), and the section it
 * showed last, so Ctrl , returns there. In the desktop app it opens on Mod , (⌘ , on macOS); in a
 * browser the key is the browser's. A key is left alone while a modal dialog is open, Settings
 * included, while an input method composes, and when the page has already handled it.
 *
 * Each `show` is a new opening, so the dialog starts again on the section asked for even when a
 * section's link asks for another one while Settings is open.
 *
 * @example
 * const settings = useSettingsOpening(host, platform);
 * {settings.opening === undefined ? null : (
 *   <SettingsDialog key={settings.opening} requested={settings.requested}
 *     lastShown={settings.lastShown} onShown={settings.remember} onClose={settings.close} … />
 * )}
 */
export function useSettingsOpening(host: StudioHost, platform: KeyboardPlatform): SettingsOpening {
  const [shown, setShown] = useState<{ opening: number; requested: string | undefined }>();
  const [lastShown, setLastShown] = useState<string>();
  const show = useCallback((sectionId?: string) => {
    setShown((before) => ({ opening: (before?.opening ?? 0) + 1, requested: sectionId }));
  }, []);
  const close = useCallback(() => setShown(undefined), []);
  useSettingsKey(host, platform, show);
  return {
    opening: shown?.opening,
    requested: shown?.requested,
    lastShown,
    show,
    close,
    remember: setLastShown,
  };
}

function useSettingsKey(host: StudioHost, platform: KeyboardPlatform, open: () => void): void {
  useEffect(() => {
    if (host !== "desktop-app") {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isComposing(event) || isModalDialogOpen()) {
        return;
      }
      if (isSettingsKey(event, platform)) {
        event.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [host, platform, open]);
}

/** Printable ASCII: a key that types one of these is read by the character it types. */
const asciiPattern = /^[ -~]$/;

/**
 * Whether the press is Mod , with nothing else held. The comma is read by the character it types,
 * so it follows the layout; only a key that types no ASCII character, as on a Russian layout, is
 * read by its place on the keyboard.
 */
export function isSettingsKey(event: KeyboardEvent, platform: KeyboardPlatform): boolean {
  const mod = platform === "macos" ? event.metaKey : event.ctrlKey;
  const otherMod = platform === "macos" ? event.ctrlKey : event.metaKey;
  const comma = asciiPattern.test(event.key) ? event.key === "," : event.code === "Comma";
  return mod && !otherMod && !event.shiftKey && !event.altKey && comma;
}
