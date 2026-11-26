import { type HostSettings, ServiceRegistry } from "@halonicjs/app";
import { startInAppFeedback } from "@halonicjs/studio-feature-feedback";
import { feedbackPrefs } from "@halonicjs/studio-feature-feedback/api";
import { provideShellHostSettings, type TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { hostSettingsOf } from "../studio/window-host-settings.ts";

/**
 * Starts the feedback shortcut in one of Studio's own windows: Studio, Halonic Inbox or Halonic
 * Messenger (`feedback.in-app`). The window hears the shortcut only while it is focused,
 * and the selection overlay shows inside it. The shortcut is read from the window's host
 * settings on each press, so a change in Settings → Keyboard counts at once. Gives the stop.
 */
export function startWindowFeedback(
  page: { readonly window: object },
  ipc: TauriIpc,
  platform: KeyboardPlatform,
): () => void {
  const window = page.window as Window;
  if (typeof window.addEventListener !== "function" || window.document === undefined) {
    return () => undefined;
  }
  const services = new ServiceRegistry();
  provideShellHostSettings(services, page.window);
  let settings: HostSettings | undefined;
  void hostSettingsOf(services, page.window).then((loaded) => {
    settings = loaded;
  });
  return startInAppFeedback({
    ipc,
    platform,
    window,
    shortcut: () =>
      settings?.loaded === true
        ? settings.get(feedbackPrefs.shortcut)
        : feedbackPrefs.shortcut.fallback,
  });
}
