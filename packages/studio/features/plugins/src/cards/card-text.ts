// The words of a plugin's card on Home, from the plugin screens design
// section 8.2, microcopy 24 T15 and the UX acceptance checklist 8 (HAL-1739,
// HAL-1952). Every button word is Halonic's; the plugin's name and the
// card's title are only ever a value in these lines. The footer is the
// commands' "From the *name* plugin".

export const REVIEW = "Review";
export const DETAILS = "Details";

/** The ↻ button's name: "Refresh Today's weather". */
export function refreshLabel(title: string): string {
  return `Refresh ${title}`;
}

/**
 * The card's tool failed: "Couldn't get Today's weather: the service is busy." A reason that ends
 * in a full stop doesn't get a second one.
 */
export function cardFailedLine(title: string, reason: string): string {
  return `Couldn't get ${title}: ${reason.replace(/[.!?]+$/u, "")}.`;
}

/** The plugin is new or changed since it was trusted. */
export function notTrustedLine(name: string): string {
  return `${name} isn't trusted yet, so this card is empty.`;
}

/** The plugin's folder can't be read or checked. */
export function cantLoadLine(name: string): string {
  return `${name} couldn't load, so this card is empty.`;
}
