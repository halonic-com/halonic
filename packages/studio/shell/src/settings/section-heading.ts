/**
 * Puts the focus on the heading of the settings section that holds `inside`: a section that was
 * showing why it couldn't load, and now has its content, hands the focus to its name, since the
 * button that had it is gone. Does nothing when `inside` isn't in a section with a heading.
 */
export function focusSectionHeading(inside: Element | null): void {
  const id = inside?.closest("section[aria-labelledby]")?.getAttribute("aria-labelledby");
  if (id) document.getElementById(id)?.focus();
}
