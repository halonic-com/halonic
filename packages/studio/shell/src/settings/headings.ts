import type { SettingsSurface } from "./settings-groups.ts";

/**
 * Puts the focus on the heading of the settings section that holds `inside`: a section that was
 * showing why it couldn't load, and now has its content, hands the focus to its name, since the
 * button that had it is gone. Does nothing when `inside` isn't in a section with a heading.
 */
export function focusSectionHeading(inside: Element | null): void {
  sectionHeading(inside)?.focus();
}

/** The heading of the settings section that holds `inside`, or `null` when there is none. */
export function sectionHeading(inside: Element | null): HTMLElement | null {
  const id = inside?.closest("section[aria-labelledby]")?.getAttribute("aria-labelledby");
  return id ? document.getElementById(id) : null;
}

/**
 * The level of a section's own headings, one under its name: `h4` under the dialog's `h3`, `h2`
 * under the phone page's `h1`, so a screen reader's outline skips no level.
 */
export function sectionHeadingLevel(surface: SettingsSurface | undefined): 2 | 4 {
  return surface === "phone" ? 2 : 4;
}
