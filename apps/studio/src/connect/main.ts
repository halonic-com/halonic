import type { ComputerId } from "@halonicjs/studio-feature-remote/phone";
import { tauriChannelIpc, tauriIpc } from "@halonicjs/studio-services/tauri-ipc";
import { type ConnectBridge, localAddressStore } from "./bridge.ts";
import { type PairingScanner, tauriPairingScanner } from "./pair-scan.ts";
import { startPage } from "./start-page.ts";
import { tauriAppShortcuts } from "./tauri-app-shortcuts.ts";
import { tauriBridge } from "./tauri-bridge.ts";
import { tauriNearbyComputers } from "./tauri-nearby-computers.ts";
import { tauriOwnerCheckAvailable } from "./tauri-owner-check.ts";
import { type PhoneScreens, tauriPhoneScreens } from "./tauri-phone-screens.ts";
import { tauriPhoneTunnel } from "./tauri-phone-tunnel.ts";
import { tauriSavedDataStore } from "./tauri-saved-data-store.ts";

/**
 * Outside the app, for example while working on the page in a browser,
 * there's no shell: every Connect ends on "Can't reach", because a failed
 * call into the shell reads as that.
 */
const outsideTheApp: ConnectBridge = {
  connect: () => Promise.reject(new Error("The page isn't running in the Android app.")),
  openStudio: () => undefined,
  openReleasePage: () => Promise.resolve(),
};

/** Never used: without the shell there's no tunnel, so the phone app doesn't load. */
const noScanner: PairingScanner = {
  scan: () => Promise.resolve({ kind: "noScanner" }),
  close: () => Promise.resolve(),
};
const noScreens: PhoneScreens = { openSettings: () => undefined, openTailscale: () => undefined };

// Set by the Android shell; missing when the page opens in a browser.
const internals = tauriIpc(window);
/** An answer or refusal the page doesn't expect goes to the web view's log. */
const report = (line: string): void => console.warn(line);
// With the shell's tunnel, startPage's launch rule picks the phone app or the 0.1 page (HAL-16439).
const tunnel = internals === undefined ? undefined : tauriPhoneTunnel(window, report);
const nearby = tauriNearbyComputers(tauriChannelIpc(window), report);

void startPage({
  document,
  ...(tunnel === undefined
    ? {}
    : { computerTunnel: (computer: ComputerId) => tunnel.computerTunnel(computer) }),
  ...(internals === undefined
    ? {}
    : {
        ownerCheckAvailable: tauriOwnerCheckAvailable(internals, report),
        saved: tauriSavedDataStore(internals, report),
        shortcuts: tauriAppShortcuts(internals, report),
      }),
  bridge: internals === undefined ? outsideTheApp : tauriBridge(internals, window),
  store: localAddressStore(localStorage),
  changeAddress: location.hash === "#change-address" || location.hash === "#page-not-shown",
  pageNotShown: location.hash === "#page-not-shown",
  tunnel,
  scanner: internals === undefined ? noScanner : tauriPairingScanner(internals),
  ...(nearby === undefined ? {} : { nearby }),
  window,
  ...(internals === undefined ? noScreens : tauriPhoneScreens(internals, report)),
  report,
});
