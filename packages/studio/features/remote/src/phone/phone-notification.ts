/**
 * A phone notification for something that needs the person (Sofia's flow D, Noah's HAL-17514
 * `wording`, rows p06c and p06d). The lock screen is seen by anyone holding the phone, so its version
 * names only the computer, never what the item says (★P7); the item's own words show only once the
 * phone is unlocked. The shell must never show `unlocked` while the phone is locked, whatever the
 * phone's own settings: Android's `VISIBILITY_PRIVATE` isn't enough, because with "Show sensitive
 * content when locked" on, its default, Android shows the full notification on the lock screen.
 */
import { phoneNotificationWords } from "./notification-words.ts";

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
    lockScreen: { title: phoneNotificationWords.lockScreen(computer) },
    unlocked,
  };
}
