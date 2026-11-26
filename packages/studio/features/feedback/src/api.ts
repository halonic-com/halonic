/**
 * The services and types other features may use. Features import each other only through this
 * file.
 */
import { type KeyboardPlatform, type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

export { feedbackPrefs } from "./feedback-prefs.ts";

/**
 * What changing the feedback shortcut came to, as the shell answers `plugin:feedback|shortcut_set`:
 * saved, `taken` by the system or another app, `invalid` (no Ctrl, Alt or ⌘), `unavailable` where
 * Studio hears no keys, or `failed` when it couldn't be saved and the old keys came back.
 */
export type ShortcutChange = "saved" | "taken" | "invalid" | "unavailable" | "failed";

/**
 * Whether Studio is connected to Paperclip now, as the main window's open folder says
 * (`feedback.connected-only`). Send feedback shows only while it is: the board decides on the
 * 0.2.0 release card who gets it, and until then people without Paperclip see none of it.
 */
export interface FeedbackConnected {
  /** Whether a Paperclip connection of the open folder holds its key now. */
  current(): boolean;
  /** Calls `listener` when that may have changed; returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/**
 * What Settings → Keyboard and Settings → Feedback need of the desktop app. Only Studio's own
 * main window has it: the shell grants `shortcut_set` to no other window, and served Studio has
 * no shell, so there the two sections don't show.
 */
export interface FeedbackSettingsHost {
  /** The platform the keys are shown for: ⌘ ⌥ F on macOS, Ctrl Alt F elsewhere. */
  readonly platform: KeyboardPlatform;
  /** Asks the shell to hear `shortcut` instead of the feedback shortcut it hears now. */
  setShortcut(shortcut: string): Promise<ShortcutChange>;
  /** How many feedbacks wait to be sent; absent until the app keeps them, and then no line shows. */
  waiting?(): Promise<number>;
  /** Whether Studio is connected to Paperclip; absent counts as connected. */
  readonly connected?: FeedbackConnected;
  /**
   * Begins a feedback as the shortcut does, for Help › Send feedback and its Ctrl K entry
   * (`feedback.help-send-feedback`); absent where the window doesn't take feedback, and then
   * neither shows.
   */
  start?(): void;
}

/** The desktop app's {@link FeedbackSettingsHost}. */
export const FeedbackSettingsService: ServiceKey<FeedbackSettingsHost> =
  serviceKey<FeedbackSettingsHost>("feedback.settings");

/**
 * Quick ask's keys as a sentence names them: "Ctrl+Alt+Space", and "⌥Space" on macOS, as its
 * menus write them. For whatever tells people the box is there: Help › Quick ask, its Ctrl K
 * entry and the first-run card's line (`feedback.help-quick-ask`, `first-run.you-did-it-quick-ask`).
 */
export interface AskKeysText {
  /**
   * The keys now; `undefined` until the shell has said them, and while they don't work (taken,
   * Wayland or unavailable), so nothing names keys that do nothing.
   */
  current(): string | undefined;
  /** Calls `listener` when the keys change; returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The feedback feature's {@link AskKeysText}, in every window; it names keys only in Studio's own. */
export const AskKeysTextService: ServiceKey<AskKeysText> =
  serviceKey<AskKeysText>("feedback.ask-keys-text");
