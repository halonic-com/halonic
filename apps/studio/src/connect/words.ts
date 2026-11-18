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
  // HAL-12253: Android 17's "Nearby devices" permission, turned down.
  noLocalNetwork: (address: string): Piece[] => [
    `Halonic needs the Nearby devices permission to reach ${address}. Press Connect and choose Allow, or turn it on in your phone's Settings under Apps, Halonic, Permissions.`,
  ],
  appTooOld: (computerVersion: string): string =>
    `This app is too old for Halonic on your computer (${computerVersion}). Install the new app to continue.`,
  computerTooOld: (computerVersion: string): string =>
    `Halonic on your computer (${computerVersion}) is too old for this app. Update Halonic on your computer, then try again.`,
} as const;
