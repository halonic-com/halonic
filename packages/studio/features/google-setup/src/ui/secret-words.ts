/** Which computer keeps the client secret, as the host says (`SecretEntry`). */
export type KeptOn = "this-computer" | "host-computer";

/** "8 Nov, 10:41": the day, the short month and the time, in the order the design writes them. */
export function savedOn(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * What Studio says about where the secret is, which is never "in the keychain" or "removed from
 * this computer": it is "kept encrypted", and only Halonic's host can read it. A served Studio
 * names the computer that runs Halonic, since the secret isn't on the device in front of you.
 */
export function keptLine(keptOn: KeptOn): string {
  return keptOn === "this-computer"
    ? "Kept encrypted on this computer. Halonic can't show it."
    : "Kept encrypted on the computer that runs Halonic. Halonic can't show it.";
}

/** The hint under the empty secret field: where Google showed it, then {@link keptLine}. */
export function entryHint(keptOn: KeptOn): string {
  return `Google showed it next to the client ID. ${keptLine(keptOn)}`;
}

/** What the secret field says when saving failed. It never repeats the value. */
export const secretSaveFailed = "Couldn't save the secret. Nothing was saved.";

/** Under the new-secret field: the saved secret keeps working until Google accepts the new one. */
export const replaceStaged = "The saved secret stays in use until Google accepts the new one.";

/** Under the new-secret field before the first sign-in, when there is nothing to check it with. */
export const replaceBeforeSignIn =
  "Not signed in yet, so the new secret replaces the old one now. Step 7 checks it.";

/** Google refused the new secret. The field stays open for another try. */
export const replaceRefused =
  "Google didn't accept this secret. Your old secret is still saved and in use.";

/** Google couldn't be reached to check the new secret. */
export const replaceNoNetwork =
  "Couldn't reach Google to check the new secret. The old one is still in use. Try again when you're online.";

/** Said once the secret was replaced straight away, before the first sign-in. */
export const replacedNow = "Saved the new secret. Step 7 checks it.";

/**
 * Said once Google accepted the new secret. When accounts share the client, it names them, since
 * one new secret is the new secret for all of them.
 */
export function replaceAccepted(usedBy: readonly string[]): string {
  const base =
    "Google accepted the new secret. Halonic deletes the old secret and stops using it. You can disable the old one in Google Cloud once every account using it has the new one.";
  if (usedBy.length < 2) return base;
  const names = new Intl.ListFormat("en", { type: "conjunction" }).format(usedBy);
  return `${base} Used by ${names}, ${usedBy.length === 2 ? "both" : "all"} now on the new secret.`;
}

/** The words of the open secret field: a first secret, or a new one for a saved secret. */
export interface FieldWords {
  /** Under the input. */
  readonly hint: string;
  /** Why **Save** can't be used yet, as visible text. */
  readonly unavailable: string;
  /** The button's label. A failed send says **Try again**, and a refusal needs a new value. */
  readonly button: string;
}

/**
 * @param replacing - the field is for a new secret while one is saved
 * @param beforeFirstSignIn - the setup hasn't been signed in, so a new secret replaces the old now
 * @param retry - the last send failed or couldn't reach Google, so the same value goes again
 * @param answering - the engine answers
 */
export function fieldWords(options: {
  readonly replacing: boolean;
  readonly beforeFirstSignIn: boolean;
  readonly keptOn: KeptOn;
  readonly retry: boolean;
  readonly answering: boolean;
}): FieldWords {
  const { replacing, beforeFirstSignIn, keptOn, retry, answering } = options;
  const unavailable = answering ? "" : "Can't save while the engine isn't answering.";
  if (!replacing) {
    return {
      hint: entryHint(keptOn),
      unavailable: answering ? "Paste the client secret to save it." : unavailable,
      button: retry ? "Try again" : "Save secret",
    };
  }
  return {
    hint: beforeFirstSignIn ? replaceBeforeSignIn : replaceStaged,
    unavailable: answering ? "Paste the new secret to save it." : unavailable,
    button: retry ? "Try again" : "Save new secret",
  };
}
