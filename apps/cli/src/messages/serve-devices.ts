import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic serve pair` and `halonic serve devices`, on the computer that runs
 * `halonic serve` (`server.device-pairing`). A device's name is outside text, made printable
 * before it gets here.
 */
export const serveDevicesMessages = defineMessages("serveDevices", {
  /** `serve pair`'s line in `halonic serve --help`. */
  pairSummary: () => phrase`Add a device: show a one-time code, then allow the device that uses it`,
  /** `serve devices`' line in `halonic serve --help`. */
  devicesSummary: () => phrase`List the paired devices, or sign one out`,
  /** What `serve pair` was doing, for "✕ Couldn't add a device to acme: …". */
  pairAction: (place: string) => phrase`add a device to ${place}`,
  /** What `serve devices` was doing, for "✕ Couldn't list the devices of acme: …". */
  devicesAction: (place: string) => phrase`list the devices of ${place}`,
  /** `--revoke`'s line in `halonic serve devices --help`. */
  revokeOption: () => phrase`Sign out the device with this id, as the list shows it.`,
  /** `--yes`'s line in `halonic serve devices --help`. */
  yesOption: () => phrase`Also sign out the devices it allowed, without asking.`,
  /** No `serve-password` is set: a device signs in with the password's protection only. */
  noPassword: () => phrase`no sign-in password is set, so no device can pair.`,
  /** The fix under {@link noPassword}. */
  noPasswordFix: () => phrase`Set one first with: halonic secret set serve-password`,
  /** No `serve` runs for the workspace. */
  notServing: () => phrase`halonic serve isn't running for this workspace.`,
  /** The fix under {@link notServing}. */
  notServingFix: () => phrase`Start it in another terminal with: halonic serve`,
  /** Windows has no console channel yet. */
  noConsoleOnWindows: () => phrase`this works only on Linux and macOS for now.`,
  /** The profile folder is too deep for a socket's path. */
  consolePathTooLong: () =>
    phrase`the path to your Halonic profile folder is too long for the console channel.`,
  /**
   * The console's folder isn't this user's alone, or something other than a socket of theirs is
   * where the socket goes, so `serve` didn't open it. `folder` is the console's folder.
   */
  consoleNotPrivate: (folder: string) =>
    phrase`${folder} isn't yours alone, or holds something else where the socket goes. Remove that folder, then start halonic serve again.`,
  /** The line on stderr when `serve`'s console channel couldn't open; it serves on. */
  consoleNotOpened: (reason: string) =>
    phrase`${markPart("needsYou")} halonic serve pair and halonic serve devices won't work: ${reason}`,
  /** The code, in two groups of four, as a person types it. */
  pairingCode: (code: string) => phrase`Pairing code: ${code}`,
  /** Under {@link pairingCode}. */
  pairingCodeHelp: () =>
    phrase`Type it on the device you're adding. It works once, for 10 minutes. Stop with Ctrl C.`,
  /** Shown before the question: the device and its check code, which the person compares. */
  requestShown: (device: string, checkCode: string) =>
    phrase`${device} asks to pair. Its check code is ${checkCode}: make sure the device shows the same code.`,
  /** The question for one waiting request. */
  allowQuestion: (device: string) => phrase`Allow ${device}?`,
  /** Nobody can answer: no terminal, `CI` or `--json`. */
  allowNoTerminal: () => phrase`There's no terminal here to allow the device in.`,
  /** The fix under {@link allowNoTerminal}. */
  allowNoTerminalFix: () => phrase`Run halonic serve pair in a terminal.`,
  /** The device was allowed and can collect its session. */
  allowed: (device: string) => phrase`${markPart("done")} ${device} is paired.`,
  /** The person said no. */
  notAllowed: (device: string) =>
    phrase`${device} wasn't allowed. For a new code, run halonic serve pair again.`,
  /** The request ran out between the list and the Allow. */
  requestGone: (device: string) => phrase`${device}'s request ran out before it was allowed.`,
  /** The code ran out with no device allowed. */
  codeRanOut: () =>
    phrase`The code ran out after 10 minutes. For a new one, run halonic serve pair again.`,
  /** One device in the list. */
  deviceLine: (device: string, lastSeen: string, allowedBy: string, id: string) =>
    phrase`${device} ${markPart("separator")} last seen ${lastSeen} ${markPart("separator")} allowed by ${allowedBy} ${markPart("separator")} ${id}`,
  /** Who allowed a device, in {@link deviceLine}: `halonic serve pair`. */
  byConsole: () => phrase`console`,
  /** Who allowed a device: a browser signed in with the password. */
  byBrowser: () => phrase`a browser`,
  /** Who allowed a device: a paired device that is signed out since. */
  byGoneDevice: () => phrase`a device that's signed out`,
  /** No device is paired. */
  noDevices: () => phrase`No devices are paired. Add one with: halonic serve pair`,
  /** `--revoke` names no paired device. */
  unknownDevice: (id: string) => phrase`There's no paired device ${id}.`,
  /** The fix under {@link unknownDevice}. */
  unknownDeviceFix: () => phrase`See them with: halonic serve devices`,
  /** A device was signed out. */
  signedOut: (device: string) => phrase`${markPart("done")} ${device} is signed out.`,
  /** Shown before {@link alsoRevokeQuestion}: the devices the revoked one allowed. */
  allowedDevicesHeading: (device: string) => phrase`${device} allowed these devices:`,
  /** One of them, indented. */
  allowedDeviceLine: (device: string, id: string) =>
    phrase`  ${device} ${markPart("separator")} ${id}`,
  /** Whether to sign them out too. */
  alsoRevokeQuestion: (count: number) =>
    count === 1
      ? phrase`Sign out the device it allowed too?`
      : phrase`Sign out the ${String(count)} devices it allowed too?`,
  /** They stay signed in: the person said no, or nobody could answer. */
  allowedStay: () =>
    phrase`The devices it allowed stay signed in. Sign one out with: halonic serve devices --revoke <id>`,
});
