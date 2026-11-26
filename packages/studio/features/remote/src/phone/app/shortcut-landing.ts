import type { ComputerId } from "../phone-tunnel.ts";
import type { PhoneAppScreen } from "./phone-app-router.ts";

/** The tabs a shortcut on the Android app's icon opens (HAL-19143). */
export type ShortcutTab = "inbox" | "messenger";

/** The chat the last-chat shortcut opens in the Messenger tab: its computer and its id there. */
export interface ShortcutChat {
  readonly computer: ComputerId;
  readonly chat: string;
}

/** A chat the phone opened, for the last-chat shortcut: with the name its label shows. */
export interface OpenedChat extends ShortcutChat {
  readonly name: string;
}

/** Where a shortcut lands: a tab, or the last chat (HAL-20160). */
export type ShortcutLanding = ShortcutTab | ShortcutChat;

/** The tab `landing` opens on: a chat's is the Messenger. */
export function tabOf(landing: ShortcutLanding): ShortcutTab {
  return typeof landing === "string" ? landing : "messenger";
}

/**
 * What `landing` sets on `computer`'s screen: its tab, and its chat when the chat is on that
 * computer. A chat on another computer opens the Messenger list, as a chat that's gone does.
 */
export function landingOn(
  computer: ComputerId,
  landing: ShortcutLanding | undefined,
): { readonly tab?: ShortcutTab; readonly chat?: string } {
  if (landing === undefined) return {};
  if (typeof landing === "string" || landing.computer !== computer) return { tab: tabOf(landing) };
  return { tab: "messenger", chat: landing.chat };
}

/**
 * Where a shortcut tapped while the app runs lands: the computer's screen nearest the top, on
 * `landing`'s tab, with its sheet and run detail closed and nothing under it, so Back from it
 * leaves the app as from any top-level screen (Sofia, HAL-19149). While a pairing or the first
 * list is under way there's no screen to land on yet: `undefined`, and the router keeps the
 * landing for the next computer's screen that opens.
 */
export function landed(
  stack: readonly PhoneAppScreen[],
  landing: ShortcutLanding,
): readonly PhoneAppScreen[] | undefined {
  const top = stack.at(-1);
  if (top === undefined || top.screen === "pair" || top.screen === "loading") return undefined;
  const computer = stack.filter((screen) => screen.screen === "computer").at(-1);
  if (computer === undefined) return undefined;
  return [
    {
      screen: "computer",
      computer: computer.computer,
      sheet: "none",
      ...landingOn(computer.computer, landing),
    },
  ];
}
