import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/** The sentences of `halonic google`. */
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

  secretSummary: () => phrase`Save the client secret of a Google account`,
  /** What `secret` was doing, for "✕ Couldn't save the client secret: …". */
  secretAction: () => phrase`save the client secret`,
  secretNeedsAccount: () => phrase`halonic google secret needs an account.`,
  secretUsage: () => phrase`halonic google secret <account>`,
  /** Someone typed the secret after the account, where the shell would keep it. */
  secretAsArgument: () => phrase`A client secret can't be given as an argument.`,
  secretAsArgumentFix: () => phrase`Run halonic google secret <account> and type it at the prompt.`,
  /** The hidden prompt's label, after which ": " is written. */
  secretPrompt: () => phrase`Client secret`,
  secretNoTerminal: () => phrase`There's no terminal to type the client secret in.`,
  secretNoTerminalFix: () => phrase`Run halonic google secret <account> in a terminal.`,
  secretNoValue: () => phrase`No client secret was given. Nothing was saved.`,
  secretSaved: () => phrase`${markPart("done")} Saved.`,
  unknownAccount: () => phrase`There's no Google account set up under that name.`,
  unknownAccountFix: () => phrase`Start the setup in the Studio first.`,
  secretNeedsTokenKey: () => phrase`The secret can't be saved: the token key isn't set.`,
  secretNeedsTokenKeyFix: () =>
    phrase`Set the secret token-key to 32 random bytes in base64url, then try again.`,
  /** The account has signed in, or shares its client: a new secret has to be checked first. */
  secretNeedsStaging: () =>
    phrase`This account has signed in, so its secret can't be replaced here.`,
  secretNeedsStagingFix: () => phrase`Replace it in the Studio, which checks it with Google first.`,
});
