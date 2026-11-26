import type { TauriIpc } from "@halonicjs/studio-services/tauri-ipc";

/** The screen a shortcut opens: Inbox, Messenger, or the last chat on its computer. */
export type ShortcutOpening =
  | { readonly screen: "inbox" }
  | { readonly screen: "messenger" }
  | { readonly screen: "chat"; readonly computer: string; readonly chat: string };

/** A chat for the last-chat shortcut: its computer, its id there and the name it shows. */
export interface ShortcutChat {
  readonly computer: string;
  readonly chat: string;
  readonly name: string;
}

/** The screens a page may pin to the home screen. */
export type PinnableScreen = "inbox" | "messenger";

/** The Android app's shortcuts, as the phone's own page uses them (HAL-19143). */
export interface AppShortcuts {
  /** The screen the last shortcut asked for, once; undefined when none did. */
  readonly takeOpening: () => Promise<ShortcutOpening | undefined>;
  /** Makes `chat` the last-chat shortcut, or removes it. */
  readonly setLastChat: (chat: ShortcutChat | undefined) => void;
  /** Whether the launcher pins shortcuts; false when the shell can't tell. */
  readonly canPin: () => Promise<boolean>;
  /** Opens Android's own Add to Home screen for `screen`. */
  readonly pin: (screen: PinnableScreen) => void;
}

const screens = new Set(["inbox", "messenger", "chat"]);

/** The shell's answer as an opening, or undefined for anything the page doesn't know. */
function openingOf(answer: unknown): ShortcutOpening | undefined {
  if (typeof answer !== "object" || answer === null || !("screen" in answer)) return undefined;
  const { screen } = answer;
  if (typeof screen !== "string" || !screens.has(screen)) return undefined;
  if (screen !== "chat") return { screen } as ShortcutOpening;
  const { computer, chat } = answer as { computer?: unknown; chat?: unknown };
  if (typeof computer !== "string" || typeof chat !== "string") return { screen: "messenger" };
  return { screen, computer, chat };
}

/**
 * The shell's `phone_open_target`, `phone_last_chat`, `phone_can_pin` and `phone_pin`. A refusal
 * or a false answer goes to the log and changes nothing on the page: a shortcut that can't be
 * read opens the app as its own icon does.
 */
export function tauriAppShortcuts(
  internals: TauriIpc,
  report: (line: string) => void,
): AppShortcuts {
  const refused = (command: string) => (error: unknown) => {
    report(`${command} was refused: ${String(error)}`);
  };
  const told = (command: string, answer: unknown) => {
    if (answer !== true) report(`${command} did nothing.`);
  };
  return {
    takeOpening: () =>
      internals.invoke("phone_open_target").then(openingOf, (error: unknown) => {
        refused("phone_open_target")(error);
        return undefined;
      }),
    setLastChat: (chat) => {
      internals
        .invoke("phone_last_chat", { chat: chat ?? null })
        .then((answer) => told("phone_last_chat", answer), refused("phone_last_chat"));
    },
    canPin: () =>
      internals.invoke("phone_can_pin").then(
        (answer) => answer === true,
        (error: unknown) => {
          refused("phone_can_pin")(error);
          return false;
        },
      ),
    pin: (screen) => {
      internals
        .invoke("phone_pin", { screen })
        .then((answer) => told("phone_pin", answer), refused("phone_pin"));
    },
  };
}
