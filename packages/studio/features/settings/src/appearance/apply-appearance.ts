import type { DisplaySettings } from "../display-settings.ts";
import {
  frameColourPair,
  frameColoursPref,
  panelOpacityPref,
  themePref,
} from "./appearance-prefs.ts";

/**
 * Shows the Appearance settings on the window's root element (`<html>`), so the whole window
 * changes at once, Settings included, without a reload (flow-settings 5):
 * - the theme as `data-theme`, or none for System, so the kit follows the computer's setting;
 * - the frame colours as `--halo-blue` and `--halo-violet` only, never `accent` or `primary`,
 *   so buttons, links and focus rings keep their colour; the halo tints follow from them;
 * - the panel opacity as `--panel-opacity`.
 *
 * @returns a function that stops following the settings; what it set stays
 *
 * @example
 * const stop = watchAppearance(settings, document.documentElement);
 */
export function watchAppearance(settings: DisplaySettings, root: HTMLElement): () => void {
  const apply = () => applyAppearance(settings, root);
  apply();
  return settings.subscribe(apply);
}

function applyAppearance(settings: DisplaySettings, root: HTMLElement): void {
  const theme = settings.get(themePref);
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  const [first, second] = frameColourPair(settings.get(frameColoursPref));
  root.style.setProperty("--halo-blue", first);
  root.style.setProperty("--halo-violet", second);
  root.style.setProperty("--panel-opacity", String(settings.get(panelOpacityPref)));
}
