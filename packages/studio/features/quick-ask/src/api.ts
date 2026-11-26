import type { MessagingId } from "@halonicjs/ports";
import { type KeyboardPlatform, type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { AskSession } from "./ask-session.ts";

export type { AnswerState } from "./ask-answer.ts";
export type { AskAgent, AskOpening, AskOutcome, AskSession, LastAnswer } from "./ask-session.ts";

/**
 * The quick-ask box's {@link AskSession}, made the first time it's asked for from the open
 * workspace's Messenger, so a Studio without one loads fine and only asking fails.
 */
export const AskSessionService: ServiceKey<AskSession> =
  serviceKey<AskSession>("quick-ask.session");

/** What the box asks of the window it floats in, which the desktop app gives it. */
export interface AskWindow {
  /** Hides the box's window: Esc, or a click beside the box. */
  hide(): Promise<void>;
  /** Brings Studio's window forward, for **Open Studio** when there's no agent to ask. */
  openStudio(): Promise<void>;
  /**
   * Opens Messenger's window on the chat `conversation` and hides the box's window, for **Open in
   * Messenger**, **Answer in Messenger** and **Last answer ›**.
   */
  openChat(conversation: MessagingId): Promise<void>;
}

/**
 * The box's {@link AskWindow}, given by the desktop app. Without one, as in the served Studio,
 * the box still shows and asks; only hiding, Open Studio and opening a chat do nothing.
 */
export const AskWindowService: ServiceKey<AskWindow> = serviceKey<AskWindow>("quick-ask.window");

/**
 * Whether quick ask's keys work, as the shell says (`KeyState` in `quick_ask_keys.rs`): `on`,
 * `taken` by the system or another app, `wayland` where the desktop lets no app take a key for
 * the whole screen, or `unavailable` where Studio hears no keys.
 */
export type AskKeysState = "on" | "taken" | "wayland" | "unavailable";

/** Quick ask's keys in the shell's words (`"control+alt+Space"`) and whether they work. */
export interface AskKeys {
  readonly shortcut: string;
  readonly state: AskKeysState;
}

/**
 * What changing quick ask's keys came to, as the shell answers `plugin:quick-ask|shortcut_set`:
 * saved, or refused as `taken`, `invalid` (no Ctrl, Alt or ⌘), `wayland`, `unavailable`, or
 * `failed` when it couldn't save them and the old keys came back.
 */
export type AskKeysChange = "saved" | "taken" | "invalid" | "wayland" | "unavailable" | "failed";

/** What Settings → Keyboard needs to show and change quick ask's keys. */
export interface AskKeysSettings {
  /** The platform the keys are shown for: ⌥Space on macOS, Ctrl Alt Space elsewhere. */
  readonly platform: KeyboardPlatform;
  /** Reads the keys and whether they work. */
  keys(): Promise<AskKeys>;
  /** Asks the shell to open the box on `shortcut` instead of the keys it hears now. */
  setKeys(shortcut: string): Promise<AskKeysChange>;
}

/**
 * The desktop app's {@link AskKeysSettings}, in Studio's own main window only: the shell grants
 * `plugin:quick-ask|shortcut` and `shortcut_set` to no other window, and served Studio has no
 * shell, so there Settings shows no Quick ask row.
 */
export const AskKeysSettingsService: ServiceKey<AskKeysSettings> =
  serviceKey<AskKeysSettings>("quick-ask.keys-settings");
