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

  signInSummary: () => phrase`Sign a Google account in, in the browser of this computer`,
  /** What `sign-in` was doing, for "✕ Couldn't sign in: …". */
  signInAction: () => phrase`sign in`,
  signInNeedsMore: () => phrase`halonic google sign-in needs an account.`,
  signInUsage: () => phrase`halonic google sign-in <account> [--connection <id>] [--dir <folder>]`,
  signInConnectionOption: () =>
    phrase`Check that the account is set up for this connection; it signs in the address of the account's own connection either way`,
  signInOtherWorkspace: () => phrase`This account was set up for another workspace.`,
  signInOtherWorkspaceFix: () =>
    phrase`Run the command in the workspace the account was set up for, or use --dir.`,
  signInOtherConnection: (connection: string) =>
    phrase`This account isn't set up for the connection "${connection}".`,
  signInOtherConnectionFix: () =>
    phrase`Leave out --connection, or name the connection the account was set up for.`,
  signInNoClientId: () => phrase`This account has no client ID yet.`,
  signInNoClientIdFix: () => phrase`Finish the client step of the setup in the Studio first.`,
  signInNoSecret: () => phrase`This account has no client secret yet.`,
  signInNoSecretFix: () => phrase`Run halonic google secret <account> first.`,
  signInNoServices: (workspace: string) =>
    phrase`No integration in ${workspace} asks for Google scopes, so there is nothing to sign in for.`,
  signInNoServicesFix: () => phrase`Add an integration with googleScopes to the workspace.`,
  signInNoPort: () => phrase`Couldn't open a local port for Google's answer.`,
  signInNoPortFix: () => phrase`Close what blocks local ports and try again.`,
  /** The live line while the browser is at Google. */
  signInWaiting: () => phrase`Wait for you to sign in in the browser`,
  signInOpenThis: () => phrase`Open this address in a browser on this computer:`,
  /** The address on its own line, so it can be copied. */
  signInOpenThisAddress: (address: string) => phrase`${address}`,
  signInTimedOut: () => phrase`No sign-in came back in time. Nothing was saved.`,
  signInTimedOutFix: () => phrase`Run halonic google sign-in again.`,
  signedIn: () => phrase`${markPart("done")} Signed in.`,
  serviceWorks: (service: string) => phrase`${markPart("done")} ${service} works.`,
  serviceAllowed: (service: string) =>
    phrase`${markPart("done")} ${service} is allowed. Halonic can't check it before it is used.`,
  serviceScopeMissing: (service: string) =>
    phrase`${markPart("needsYou")} ${service} wasn't allowed everything it needs. Sign in again and tick every box.`,
  serviceApiOff: (service: string, api: string, url: string) =>
    phrase`${markPart("needsYou")} ${service}: switch on the ${api} at ${url}, then check again.`,
  serviceApiOffNoLink: (service: string, api: string) =>
    phrase`${markPart("needsYou")} ${service}: switch on the ${api} in the Google console, then check again.`,
  serviceCheckFailed: (service: string) =>
    phrase`${markPart("needsYou")} ${service} couldn't be checked: Google refused the request.`,
  serviceUnreachable: (service: string) =>
    phrase`${markPart("needsYou")} ${service} couldn't be checked: Google didn't answer.`,
  signInCancelled: () => phrase`The sign-in was cancelled. Nothing was saved.`,
  signInBlocked: () => phrase`Google didn't let this account sign in to the app.`,
  signInBlockedFix: () => phrase`Ask the administrator of the account, or use a personal account.`,
  signInWrongAccount: () => phrase`Another Google account signed in. Nothing was saved.`,
  signInWrongAccountFix: () => phrase`Sign in with the address of the connection.`,
  signInSecretRefused: () => phrase`Google refused the client secret. Nothing was saved.`,
  signInSecretRefusedFix: () => phrase`Run halonic google secret <account> with the right secret.`,
  signInCodeRefused: () => phrase`Google refused the sign-in. Nothing was saved.`,
  signInCodeRefusedFix: () => phrase`Run halonic google sign-in again.`,
  signInNoRefreshToken: () => phrase`Google gave no way to stay signed in. Nothing was saved.`,
  signInNoRefreshTokenFix: () =>
    phrase`Remove Halonic from your Google account's third-party access, then sign in again.`,
  signInGoogleError: (code: string) => phrase`Google answered with the error "${code}".`,
  signInUnreachable: () => phrase`Google couldn't be reached. Nothing was saved.`,
  signInUnreachableFix: () => phrase`Check the connection and run halonic google sign-in again.`,
  signInBadCallback: () =>
    phrase`The browser's answer wasn't a complete sign-in. Nothing was saved.`,
  signInBadCallbackFix: () => phrase`Run halonic google sign-in again and use the new address.`,
  signInIdTokenRefused: () => phrase`Google's answer couldn't be trusted. Nothing was saved.`,
});
