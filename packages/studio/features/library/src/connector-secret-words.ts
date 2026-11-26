// The words of a connector's Secrets section (HAL-14995). They follow the plugin secret fields
// in Settings (plugin screens design section 7, microcopy 10.3 "Key saving / failed"): the state
// next to the name, a line about where it's kept, and never the value.

import { reasonAfterColon } from "@halonicjs/studio-shell";

/** What the keychain said about a secret: a value, none, or nothing (it couldn't be read). */
export type ConnectorSecretState = "set" | "not-set" | "unknown";

/** A connector whose secrets Studio sets: one whose program it starts, or a local integration. */
export type LocalConnectorKind = "stdio" | "integration";

/** The words of the connector page's Secrets section. */
export const connectorSecretWords = {
  heading: "Secrets",
  /** Next to the name. "Not set" is amber; "Can't check" is neutral, since it isn't "Not set". */
  state: {
    set: "Set",
    "not-set": "Not set",
    unknown: "Can't check",
  } satisfies Record<ConnectorSecretState, string>,
  /**
   * Under the name: where it's kept and where it goes, in the approved key hint's words (microcopy
   * rev 96, as on the Models page). It names the keychain, not "your secrets", because the CLI
   * reads the profile's secrets file, not this store (C553 row 26). The last sentence says which
   * one Studio uses, because `halonic doctor` tells people to run `halonic secret set`, which
   * keeps a separate one (C552 finding 1, C595 row 25). It doesn't say "only": another connector
   * or a model may name the same secret. Only the middle sentence depends on the kind: see
   * {@link whoGetsItWords}.
   */
  storedLine: (source: string, kind: LocalConnectorKind) =>
    `Kept in your system keychain, never in files. ${whoGetsItWords[kind](source)} Studio uses this one; halonic secret set keeps a separate one for the command line.`,
  /** In the empty entry once a value is stored: typing one replaces it. */
  replacePlaceholder: "Type a new value to replace it",
  remove: "Remove",
  /**
   * Saving failed, in 1.1's form: the reason after a colon. The second sentence only when one was
   * stored. The value is never in it.
   *
   * @example
   * connectorSecretWords.notSaved("The keychain is locked.", true);
   * // "Couldn't save the secret: the keychain is locked. The one you saved before is still in use."
   */
  notSaved: (reason: string, wasSet: boolean) => {
    const first = `Couldn't save the secret: ${reasonAfterColon(reason)}.`;
    return wasSet ? `${first} The one you saved before is still in use.` : first;
  },
  notRemoved: (reason: string) => `Couldn't remove the secret: ${reasonAfterColon(reason)}.`,
  /**
   * The connector's file names a secret that belongs to Halonic or to a plugin, which no workspace
   * may pick, so nothing was saved. The next step is in the file, not on this page (C553 row 29).
   */
  refusedName: (owner: ReservedSecretOwner) =>
    `Couldn't save the secret: a workspace can't pick a secret that belongs to ${reservedOwnerWords[owner]}. Give it another name in the connector's file.`,
};

/**
 * The Secrets line's middle sentence: who the connector gives the secret to. A local integration
 * starts no program; its HTTP client sends the secret only to the hosts the integration declares,
 * so its "only" is about where the secret goes, not who else may name it (HAL-19672, copy check
 * HAL-19673).
 */
const whoGetsItWords = {
  stdio: (source: string) => `${source} gives it to the program it starts.`,
  integration: (source: string) => `${source} sends it only to the sites it says it connects to.`,
} satisfies Record<LocalConnectorKind, (source: string) => string>;

/** Who a secret name a workspace may not pick belongs to. */
export type ReservedSecretOwner = "halonic" | "plugin";

const reservedOwnerWords = {
  halonic: "Halonic",
  plugin: "a plugin",
} satisfies Record<ReservedSecretOwner, string>;
