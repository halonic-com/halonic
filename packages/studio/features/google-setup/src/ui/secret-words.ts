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
