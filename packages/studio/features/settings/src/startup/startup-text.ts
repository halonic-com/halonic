/**
 * The words of Settings › Startup, as the board approved them on HAL-14213 (the "Setting"
 * render). macOS says "in the menu bar" where the others say "in the tray". The refusal lines
 * aren't on the card: they were decided with Sofia on HAL-18087 (HAL-2282).
 */
import type { LoginItemHost, LoginItemRefusal } from "./login-item-host.ts";

export const SECTION_TITLE = "Startup";

const where: Record<LoginItemHost["iconIn"], string> = {
  tray: "in the tray",
  "menu-bar": "in the menu bar",
};

/** The line under the section's name. */
export function description(iconIn: LoginItemHost["iconIn"]): string {
  return `When you close the window, Halonic keeps running ${where[iconIn]}, so your routines keep running. Quit it from its icon to stop everything.`;
}

/** What a screen reader hears until the shell first answers. */
export const LOADING = "Loading the startup setting";

export const START_WHEN_I_LOG_IN = "Start Halonic when I log in";

/** The switch's hint, under its name. */
export function hint(iconIn: LoginItemHost["iconIn"]): string {
  return `Halonic starts ${where[iconIn]} without opening a window, and runs the routines of the workspaces you had open when you last quit. Off, routines run only after you open Halonic.`;
}

/** The line under the switch when the shell refused. */
export const REFUSED: Readonly<Record<LoginItemRefusal, string>> = {
  not_installed:
    "Only an installed Halonic can start when you log in. Install Halonic, then try again.",
  failed: "Halonic couldn't change this setting. Try again.",
};

/** The line under the switch when the shell couldn't say whether the login item is on. */
export const READ_FAILED = "Halonic couldn't read this setting.";
