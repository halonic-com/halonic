import type { DisplayPref } from "../display-prefs.ts";

/** The themes, in the order the Theme select lists them. */
export const themes = ["system", "light", "dark"] as const;

/** `system` follows the computer's light or dark setting. */
export type Theme = (typeof themes)[number];

/** Settings → Appearance → Theme (`settings.appearance-theme`). */
export const themePref: DisplayPref<Theme> = {
  key: "appearance.theme",
  fallback: "system",
  read: (stored) => themes.find((theme) => theme === stored),
};

/** Panel opacity's lowest and highest value, and its step: 10% to 100% in steps of 10. */
export const panelOpacityRange = { min: 0.1, max: 1, step: 0.1 } as const;

/**
 * Settings → Appearance → Panel opacity (`settings.appearance-panel-opacity`): how much of the
 * frame shows through the sidebar, the page and the tabs, from 0.1 to 1. A stored number outside
 * the range or between steps is taken to the nearest step inside it, so 0.64 is 0.6 and 2 is 1.
 */
export const panelOpacityPref: DisplayPref<number> = {
  key: "appearance.panel-opacity",
  fallback: 0.8,
  read: (stored) => (typeof stored === "number" ? nearestOpacity(stored) : undefined),
};

function nearestOpacity(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const { min, max, step } = panelOpacityRange;
  const inRange = Math.min(Math.max(value, min), max);
  // Counted in whole steps, so 0.7 stays 0.7 rather than 0.7000000000000001.
  return Math.round(inRange / step) / Math.round(1 / step);
}

/** Settings → Appearance → Agent characters: orbs when on, initials when off. */
export const agentCharactersPref: DisplayPref<boolean> = {
  key: "appearance.agent-characters",
  fallback: true,
  read: (stored) => (typeof stored === "boolean" ? stored : undefined),
};
