/**
 * The connect page's words that depend on a value, exactly as microcopy 20.4
 * writes them. The fixed words are in `connect.html`.
 */

/** A run of text: plain words, or a command shown in the code font. */
export type Piece = string | { readonly code: string };

const serveCommand = { code: "halonic serve --network" };

export const words = {
  connect: "Connect",
  connecting: "Connecting…",
  notAnAddress: ["Enter an address like 192.168.1.20:4280."],
  notHomeNetwork: ["Use an address on your home network, like 192.168.1.20:4280."],
  notAnswering: (address: string): Piece[] => [
    `Can't reach Halonic at ${address}. Check that your phone and computer are on the same network and that `,
    serveCommand,
    " is running.",
  ],
  notHalonic: (address: string): Piece[] => [
    `Something answered at ${address}, but it isn't Halonic. Check the address.`,
  ],
  // HAL-12253, worded on HAL-12260: Android 17's "Nearby devices"
  // permission, turned down. `askAgain` is whether Android will show its
  // question on the next press; when it won't, only Settings can help.
  noLocalNetwork: (address: string, askAgain: boolean): Piece[] => [
    askAgain
      ? `Can't reach ${address} without the Nearby devices permission. Press Connect again and choose Allow.`
      : `Can't reach ${address} without the Nearby devices permission. In your phone's Settings, open Apps, Halonic, Permissions, Nearby devices and choose Allow. Then press Connect again.`,
  ],
  appTooOld: (computerVersion: string): string =>
    `This app is too old for Halonic on your computer (${computerVersion}). Install the new app to continue.`,
  computerTooOld: (computerVersion: string): string =>
    `Halonic on your computer (${computerVersion}) is too old for this app. Update Halonic on your computer, then try again.`,
} as const;
