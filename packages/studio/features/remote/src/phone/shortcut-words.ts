/**
 * The words of the Android app's shortcuts in the phone app (sketch approved on HAL-18991, placed
 * on Paired computers by Sofia on HAL-19149). The screens keep the names their tabs use.
 */
import type { ShortcutTab } from "./app/shortcut-landing.ts";
import { inboxWords } from "./inbox/inbox-words.ts";
import { phoneMessengerWords } from "./phone-messenger-words.ts";

export const shortcutWords = {
  /** Under Pair with a computer's intro, when a shortcut opened the app before any pairing. */
  afterPairing: {
    inbox: "After pairing, Inbox opens.",
    messenger: "After pairing, Messenger opens.",
  } satisfies Record<ShortcutTab, string>,
  /** The group's heading on Paired computers. */
  homeScreen: "Home screen",
  screen: {
    inbox: inboxWords.tab,
    messenger: phoneMessengerWords.title,
  } satisfies Record<ShortcutTab, string>,
  add: "Add",
  /** Add's name for a screen reader, which starts with the word it shows (WCAG 2.5.3). */
  addName: (screen: string) => `Add ${screen}`,
};
