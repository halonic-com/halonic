import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/** The sentences of `halonic google allow-sending`. */
export const googleMessages = defineMessages("google", {
  summary: () => phrase`Choose what Halonic may do with a Google connection`,
  allowSendingSummary: () => phrase`Switch sending on or off for one Google connection`,
  /** What `allow-sending` was doing, for "✕ Couldn't change the setting: …". */
  allowSendingAction: () => phrase`change the setting`,

  sendingOn: (connection: string, workspace: string) =>
    phrase`${markPart("done")} Sending is on for ${connection} in ${workspace}.`,
  sendingOff: (connection: string, workspace: string) =>
    phrase`${markPart("done")} Sending is off for ${connection} in ${workspace}.`,

  allowSendingNeedsMore: () =>
    phrase`halonic google allow-sending needs a connection and on or off.`,
  allowSendingUsage: () => phrase`halonic google allow-sending <connection> on|off`,
  unknownConnection: (typed: string, workspace: string) =>
    phrase`There's no connection called "${typed}" in ${workspace}.`,
  /** Line 2 under {@link unknownConnection} when no id is close. */
  seeConnections: () => phrase`Use the connection's file name, without .connector.yaml.`,
  didYouMean: (name: string) => phrase`Did you mean ${name}?`,
  notGoogle: (connection: string) => phrase`"${connection}" isn't a Google connection.`,
  notGoogleFix: () => phrase`Only a Google connection has this setting.`,
});
