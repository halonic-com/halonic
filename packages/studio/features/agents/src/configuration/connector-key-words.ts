/**
 * The words of a connector's secret on the Tools page (flow-agents 5.2). The question, its button,
 * the field and its failure are the Models page's key words (microcopy 6.3, save model 8.2), so a
 * key reads the same wherever it changes.
 */
export const connectorKeyWords = {
  /** Shows the secret by its name, never its value (flow-agents 5.2). Team decision, HAL-18932. */
  usesKey: (connector: string, secret: string) => `${connector} uses the key ${secret}.`,
  changeKey: "Change key",
  /**
   * A line's Change key for a screen reader or a voice user, so each connector's button has its own
   * name, starting with the words it shows (WCAG 2.5.3). Team decision, HAL-20316.
   */
  changeKeyFor: (secret: string) => `Change key: ${secret}`,
  /** The question's title (microcopy "Changing a key that's set"). */
  changeTitle: (secret: string) => `Change ${secret}?`,
  changeBody: "Every agent that uses it switches to the new key right away.",
  keyLabel: "API key",
  keyPlaceholder: "Paste a new key to replace it",
  pasteFirst: "Paste the key first.",
  saving: "Saving…",
  /** `reason` comes with the key already taken out of it. */
  saveFailed: (reason: string) => {
    const why = reason.trim().replace(/\.$/, "");
    const failed = why === "" ? "Couldn't save the key" : `Couldn't save the key: ${why}`;
    return `${failed}. Your old key is still in use.`;
  },
  saved: (connector: string) => `Saved key for ${connector}`,
} as const;
