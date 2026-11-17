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
