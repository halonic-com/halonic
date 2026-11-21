// The words of a connector's Secrets section (HAL-14995). They follow the plugin secret fields
// in Settings (plugin screens design section 7, microcopy 10.3 "Key saving / failed"): the state
// next to the name, a line about where it's kept, and never the value.

/** What the keychain said about a secret: a value, none, or nothing (it couldn't be read). */
export type ConnectorSecretState = "set" | "not-set" | "unknown";

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
   * Under the name: where it's kept and where it goes. It doesn't say "only": another connector
   * or a model may name the same secret.
   */
  storedLine: (source: string) =>
    `Stored in your secrets on this computer. ${source} gives it to the program it starts.`,
  /** In the empty entry once a value is stored: typing one replaces it. */
  replacePlaceholder: "Type a new value to replace it",
  remove: "Remove",
  /** Saving failed. The second sentence only when one was stored. The value is never in it. */
  notSaved: (reason: string, wasSet: boolean) => {
    const first = `Couldn't save the secret. ${sentence(reason)}`;
    return wasSet ? `${first} The one you saved before is still in use.` : first;
  },
  notRemoved: (reason: string) => `Couldn't remove the secret. ${sentence(reason)}`,
};

/** "the keychain is locked" as "The keychain is locked." */
function sentence(reason: string): string {
  const capitalized = reason.charAt(0).toUpperCase() + reason.slice(1);
  return /[.!?]$/u.test(capitalized) ? capitalized : `${capitalized}.`;
}
