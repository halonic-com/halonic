import type { SettingsWhere } from "./where.ts";

/** A failed save's words: the line under the control, and what the dialog says. */
export interface SaveFailedText {
  /** "Couldn't save the theme on this computer." */
  readonly line: string;
  /** The line for where the values are kept: "Couldn't save the theme on this phone." */
  readonly lineOn: (where: SettingsWhere) => string;
  /** The line, then what the setting is back to: "… Theme is back to System.", or "… Agent characters are back on." */
  readonly announce: (back: string) => string;
  /** What the setting is back to, on its own: "Theme is back to System." */
  readonly backTo: (back: string) => string;
}

export function saveFailed(what: string, back: (to: string) => string): SaveFailedText {
  const lineOn = (where: SettingsWhere) => `Couldn't save ${what} on this ${where}.`;
  const line = lineOn("computer");
  return { line, lineOn, announce: (to) => `${line} ${back(to)}`, backTo: back };
}
