import type { TauriIpc } from "@halonicjs/studio-services";
import type { ConnectBridge, ConnectResult } from "./bridge.ts";

/** Where "Open release page" goes. The capability allows only this address. */
export const releasePage = "https://github.com/halonic-com/halonic/releases/latest";

/** The window the page runs in: only what opening the Studio needs. */
export interface PageWindow {
  readonly history: Pick<History, "replaceState">;
  readonly location: Pick<Location, "assign">;
}

/**
 * The bridge for the real app: each call goes to the shell. The capability
 * decides what it may call: `connect`, and opening the release page.
 */
export function tauriBridge(internals: TauriIpc, page: PageWindow): ConnectBridge {
  return {
    // The shell's answer has the page's ConnectResult shape (halonic-connect).
    connect: async (address) => (await internals.invoke("connect", { address })) as ConnectResult,
    openStudio: (url) => {
      // This page's own history entry becomes the Change address state, so
      // Android back from the Studio's first page lands on the connect
      // screen with the address filled in, instead of connecting again.
      page.history.replaceState(null, "", "#change-address");
      page.location.assign(url);
    },
    openReleasePage: async () => {
      await internals.invoke("plugin:opener|open_url", { url: releasePage });
    },
  };
}
