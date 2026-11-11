// The words of a plugin's settings section, from the plugin screens design
// section 7 and the UX acceptance checklist 6.3 (HAL-1739, HAL-1952). The
// error lines follow microcopy 1.1 "Action failed" and 10.3 "Key saving /
// failed". Plugin text is never part of a sentence here except as a value.

/** The section's heading on the plugin page. */
export const SETTINGS_HEADING = "Settings";

/** Reading the setting values failed: microcopy 13.1 "Section can't load", with the reason under it. */
export const SETTINGS_NOT_LOADED = "Couldn't load the settings";
export const TRY_AGAIN = "Try again";

/** A secret setting's state, next to its label. "Not set" is amber. */
export const SECRET_SET = "Set";
export const SECRET_NOT_SET = "Not set";

/**
 * The line under a secret setting: where it's kept and where it goes.
 *
 * @param name - the secret's name, as the plugin declares it
 * @param hosts - where it's sent, already joined: "api.example.com"
 */
export function secretStoredLine(name: string, hosts: string): string {
  return `Stored in your secrets as ${name}. Sent only to ${hosts}.`;
}

/** A host the plugin takes from a setting, in the "Sent only to" line. */
export function hostFromSetting(label: string): string {
  return `the address you enter under ${label}`;
}

/**
 * A message from the host or the keychain, as a sentence: "use a number" is
 * "Use a number.", and "The keychain is locked." stays as it is. The
 * messages are Halonic's, never the plugin's.
 */
export function settingProblemLine(message: string): string {
  const sentence = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/u.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * Saving a setting failed: "Couldn't save Alerts. The disk is full.". A pick
 * or a switch goes back; typed text stays.
 */
export function settingNotSavedLine(label: string, reason: string): string {
  return `Couldn't save ${label}. ${settingProblemLine(reason)}`;
}

/**
 * Saving a secret failed. The second sentence only when one was stored.
 * The value is never in it.
 */
export function secretNotSavedLine(reason: string, wasSet: boolean): string {
  const first = `Couldn't save the secret. ${settingProblemLine(reason)}`;
  return wasSet ? `${first} The one you saved before is still in use.` : first;
}
