import { saveFailed } from "../save-failed.ts";
import type { Theme } from "./appearance-prefs.ts";

/**
 * The words of Settings → Appearance: flow-settings 5 for the controls, the microcopy (13.1 and
 * 19.8) for a failed save. The microcopy words only the theme's failure; the others follow its
 * pattern with their own name (team decision, HAL-1294).
 */

/** The Theme select's options, in `themes` order. */
export const themeNames: Readonly<Record<Theme, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const THEME = "Theme";
export const PANEL_OPACITY = "Panel opacity";
export const PANEL_OPACITY_HINT =
  "How much of the frame shows through the sidebar, the page and the tabs.";
export const AGENT_CHARACTERS = "Agent characters";
export const AGENT_CHARACTERS_SENTENCE = "Show agents as orbs. Off shows initials.";

/** Panel opacity as the slider shows and says it: 0.8 is "80%". */
export function percent(opacity: number): string {
  return `${Math.round(opacity * 100)}%`;
}

export const THEME_NOT_SAVED = saveFailed("the theme", (to) => `${THEME} is back to ${to}.`);
export const PANEL_OPACITY_NOT_SAVED = saveFailed(
  "the panel opacity",
  (to) => `${PANEL_OPACITY} is back to ${to}.`,
);
export const AGENT_CHARACTERS_NOT_SAVED = saveFailed(
  "agent characters",
  (to) => `${AGENT_CHARACTERS} are back ${to}.`,
);

/** Agent characters' value in the dialog's words: "on" or "off". */
export function onOrOff(on: boolean): string {
  return on ? "on" : "off";
}
