// The lines `halonic trust --plugin <id> --remove` and `halonic plugin remove`
// add when they signed out the plugin's sign-ins (`cli.plugin-trust`).

import { type PluginSignedOut, signInsNotConfirmed, signInsSignedOut } from "@halonicjs/app";
import { markPart, type Phrase, phrase } from "../messages/phrase.ts";
import { pluginMessages } from "../messages/plugin.ts";
import { printable } from "./printable.ts";

/**
 * "✓ Signed you out of acme-account.", and, when the provider didn't confirm,
 * "! You're signed out here. Acme Orders didn't confirm, …". None when the
 * plugin had no sign-in to sign out.
 *
 * @param name - the plugin's name, as the line above it shows it
 * @param signedOut - what the plugin service's sign-out gave
 */
export function pluginSignedOutLines(
  name: string,
  signedOut: readonly PluginSignedOut[],
): Phrase[] {
  const gone = signInsSignedOut(signedOut);
  if (gone.length === 0) return [];
  const lines = [
    phrase`${markPart("done")} ${pluginMessages.signedOut(gone.map(printable)).phrase}`,
  ];
  const notConfirmed = signInsNotConfirmed(signedOut);
  if (notConfirmed.length > 0) {
    const warning = pluginMessages.signedOutNotConfirmed(name, notConfirmed.length);
    lines.push(phrase`${markPart("needsYou")} ${warning.phrase}`);
  }
  return lines;
}
