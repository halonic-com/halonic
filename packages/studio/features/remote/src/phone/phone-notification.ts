/**
 * A phone notification for something that needs the person (Sofia's flow D, Noah's HAL-17514
 * `wording`, rows p06c and p06d). The lock screen is seen by anyone holding the phone, so its version
 * names only the computer, never what the item says (★P7); the item's own words show only once the
 * phone is unlocked. The Android shell posts it as `VISIBILITY_PRIVATE` with `lockScreen` as the
 * public version.
 */

/** The words of the phone's notifications (HAL-17514 `wording`, p06c; Noah's choice on HAL-19249). */
export const phoneNotificationWords = {
  /** p06c: the same line for every item, with the computer's name as stored at pairing. */
  lockScreen: (computer: string) => `Something needs you on ${computer}`,
} as const;

/** What needs the person, as the computer worded it: "Chief asks you: Ship phase 2 now?". */
export interface PhoneNotificationItem {
  readonly text: string;
  /** Where it came from, such as "Paperclip · Halonic", when the computer named it. */
  readonly source?: string;
}

/** One line of a notification: its title, and a body under it when there is one. */
export interface PhoneNotificationLines {
  readonly title: string;
  readonly body?: string;
}

/** A notification in its two versions: the one on the lock screen and the one shown unlocked. */
export interface PhoneNotification {
  /** Android's `VISIBILITY_PRIVATE`: the lock screen shows only `lockScreen`. */
  readonly visibility: "private";
  readonly lockScreen: PhoneNotificationLines;
  readonly unlocked: PhoneNotificationLines;
}

/** Builds the notification for `item` from `computer`, the paired computer's stored name. */
export function phoneNotificationOf(
  computer: string,
  item: PhoneNotificationItem,
): PhoneNotification {
  const unlocked =
    item.source === undefined ? { title: item.text } : { title: item.text, body: item.source };
  return {
    visibility: "private",
    lockScreen: { title: phoneNotificationWords.lockScreen(computer) },
    unlocked,
  };
}
