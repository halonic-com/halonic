import type { ServiceRegistry } from "@halonicjs/app";
import { AskWindowService } from "@halonicjs/studio-feature-quick-ask/api";
import { provideServerSessionShell, type TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { desktopAskWindow } from "./desktop-ask-window.ts";

/**
 * The windows the desktop shell opens for a folder's page: Quick ask's window, and the terminal a
 * Run with Claude session opens in (`services.server-session-shell`), which isn't there on Windows.
 */
export function provideShellWindows(
  services: ServiceRegistry,
  { ipc, window, platform }: { ipc: TauriIpc; window: object; platform: KeyboardPlatform },
): void {
  services.provide(AskWindowService, desktopAskWindow(ipc));
  provideServerSessionShell(services, window, platform);
}
