import { type HaloPreset, haloPresets, parseHex } from "@halonicjs/studio-kit";
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

/** The two halo colours of the frame round the window, as `#3B8BFF`. */
export type FrameColourPair = readonly [first: string, second: string];

/**
 * The frame colour presets and their two colours (req-settings `settings.appearance.frame-colours`),
 * the kit's list, so the halo's contrast test checks the very colours Settings offers.
 */
export const framePresets: Readonly<Record<HaloPreset, FrameColourPair>> = haloPresets;

/** One of the frame colour presets. */
export type FramePreset = HaloPreset;

/** The frame colours: a preset, or the person's own two colours. */
export type FrameColours =
  | { readonly preset: FramePreset }
  | { readonly preset: "own"; readonly colours: FrameColourPair };

/** Settings → Appearance → Frame colours (`settings.appearance-frame-colours`). */
export const frameColoursPref: DisplayPref<FrameColours> = {
  key: "appearance.frame-colours",
  fallback: { preset: "blue-and-purple" },
  read: readFrameColours,
};

function readFrameColours(stored: unknown): FrameColours | undefined {
  if (typeof stored !== "object" || stored === null || !("preset" in stored)) {
    return undefined;
  }
  const preset = stored.preset;
  if (isFramePreset(preset)) {
    return { preset };
  }
  if (
    preset !== "own" ||
    !("colours" in stored) ||
    !Array.isArray(stored.colours) ||
    stored.colours.length !== 2
  ) {
    return undefined;
  }
  const [first, second] = stored.colours.map((colour) =>
    typeof colour === "string" ? parseHex(colour) : null,
  );
  return typeof first === "string" && typeof second === "string"
    ? { preset: "own", colours: [first, second] }
    : undefined;
}

function isFramePreset(value: unknown): value is FramePreset {
  return typeof value === "string" && Object.hasOwn(framePresets, value);
}

/** The two colours the frame shows for `frame`. */
export function frameColourPair(frame: FrameColours): FrameColourPair {
  return frame.preset === "own" ? frame.colours : framePresets[frame.preset];
}

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
