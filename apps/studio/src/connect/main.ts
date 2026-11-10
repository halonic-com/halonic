import { tauriIpc } from "@halonicjs/studio-services";
import { type ConnectBridge, localAddressStore } from "./bridge.ts";
import { startConnectPage } from "./connect-page.ts";
import { tauriBridge } from "./tauri-bridge.ts";

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

// Set by the Android shell; missing when the page opens in a browser.
const internals = tauriIpc(window);

void startConnectPage({
  document,
  bridge: internals === undefined ? outsideTheApp : tauriBridge(internals, window),
  store: localAddressStore(localStorage),
  changeAddress: location.hash === "#change-address",
});
