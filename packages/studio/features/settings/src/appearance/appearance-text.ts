import type { ColourPreset } from "@halonicjs/studio-kit";
import type { FramePreset, Theme } from "./appearance-prefs.ts";

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

/** A failed save's words: the line under the control, and what the dialog says. */
export interface SaveFailedText {
  /** "Couldn't save the theme on this computer." */
  readonly line: string;
  /** The line, then what the setting is back to: "… Theme is back to System." */
  readonly announce: (back: string) => string;
}

function saveFailed(what: string, name: string, verb = "is"): SaveFailedText {
  const line = `Couldn't save ${what} on this computer.`;
  return { line, announce: (back) => `${line} ${name} ${verb} back to ${back}.` };
}

export const THEME_NOT_SAVED = saveFailed("the theme", THEME);
export const PANEL_OPACITY_NOT_SAVED = saveFailed("the panel opacity", PANEL_OPACITY);
export const AGENT_CHARACTERS_NOT_SAVED = saveFailed("agent characters", AGENT_CHARACTERS, "are");

/** Agent characters' value in the dialog's words: "on" or "off". */
export function onOrOff(on: boolean): string {
  return on ? "on" : "off";
}

export const FRAME_COLOURS = "Frame colours";
export const FIRST_COLOUR = "First colour";
export const SECOND_COLOUR = "Second colour";
export const YOUR_OWN = "Your own";
/** A typed colour that isn't six hex digits (microcopy 13.1); the colour popover's hex field too. */
export const COLOUR_ERROR = "Enter a colour like #3B8BFF.";
export const FRAME_COLOURS_NOT_SAVED = saveFailed("the frame colours", FRAME_COLOURS, "are");

/** The Frame colours select's presets, in the order it lists them, then "Your own". */
export const framePresetNames: Readonly<Record<FramePreset, string>> = {
  "blue-and-purple": "Blue and purple",
  "green-and-blue": "Green and blue",
  "yellow-and-orange": "Yellow and orange",
  "pink-and-violet": "Pink and violet",
};

/** A colour field's swatch button: "Choose the first colour, now #3B8BFF" (microcopy 19.8). */
export function chooseColour(which: "first" | "second", colour: string): string {
  return `Choose the ${which} colour, now ${colour}`;
}

/** The colour popover a colour field's swatch button opens: "Choose the first colour". */
export function colourPopoverLabel(which: "first" | "second"): string {
  return `Choose the ${which} colour`;
}

/**
 * The swatches the colour popover offers: each colour the presets use, once, named for a screen
 * reader (team decision, HAL-1294).
 */
export const colourSwatches: readonly ColourPreset[] = [
  { value: "#3B8BFF", name: "Blue" },
  { value: "#B05ED9", name: "Purple" },
  { value: "#10B981", name: "Green" },
  { value: "#FBBF24", name: "Yellow" },
  { value: "#F97316", name: "Orange" },
  { value: "#EC4899", name: "Pink" },
  { value: "#8B5CF6", name: "Violet" },
];
export const PRESETS = "Presets";
export const HEX_COLOUR = "Hex colour";
