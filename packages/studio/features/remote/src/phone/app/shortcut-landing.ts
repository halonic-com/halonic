import type { PhoneAppScreen } from "./phone-app-router.ts";

/** The tabs a shortcut on the Android app's icon opens (HAL-19143). */
export type ShortcutTab = "inbox" | "messenger";

/**
 * Where a shortcut tapped while the app runs lands: the computer's screen nearest the top, on
 * `tab`, with its sheet and run detail closed and nothing under it, so Back from it leaves the app
 * as from any top-level screen (Sofia, HAL-19149). While a pairing or the first list is under way
 * there's no screen to land on yet: `undefined`, and the router keeps the tab for the next
 * computer's screen that opens.
 */
export function landed(
  stack: readonly PhoneAppScreen[],
  tab: ShortcutTab,
): readonly PhoneAppScreen[] | undefined {
  const top = stack.at(-1);
  if (top === undefined || top.screen === "pair" || top.screen === "loading") return undefined;
  const computer = stack.filter((screen) => screen.screen === "computer").at(-1);
  if (computer === undefined) return undefined;
  return [{ screen: "computer", computer: computer.computer, sheet: "none", tab }];
}
