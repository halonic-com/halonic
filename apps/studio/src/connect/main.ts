import { type ConnectBridge, localAddressStore } from "./bridge.ts";
import { startConnectPage } from "./connect-page.ts";

/**
 * The shell's `connect` command and the opener arrive with the Android
 * project (HAL-229). Until then the page runs, and every Connect ends on
 * "Can't reach", because a failed call into the shell reads as that.
 */
const notWiredYet: ConnectBridge = {
  connect: () => Promise.reject(new Error("The Android shell isn't wired yet (HAL-229).")),
  openStudio: () => undefined,
  openReleasePage: () => Promise.resolve(),
};

void startConnectPage({
  document,
  bridge: notWiredYet,
  store: localAddressStore(localStorage),
  changeAddress: location.hash === "#change-address",
});
