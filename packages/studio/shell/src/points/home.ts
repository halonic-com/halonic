import type { ViewRef } from "../view.ts";

/**
 * Home's sections, in the only order they are shown (design direction 3, UX checklist 1.9): Get
 * set up while setup isn't done, Needs you, then Recent runs. A section whose feature hasn't
 * added its card isn't shown.
 */
export const homeSections = ["setup", "needs-you", "recent-runs"] as const;

/** One of Home's sections. */
export type HomeSection = (typeof homeSections)[number];

/**
 * Each section's heading, which also names its region (microcopy 3.3). The shell owns them, as it
 * owns the places' names, so a section is called the same whichever feature adds its card.
 */
export const homeSectionTitles: Readonly<Record<HomeSection, string>> = {
  setup: "Get set up",
  "needs-you": "Needs you",
  "recent-runs": "Recent runs",
};

/**
 * A card on Home: one section, such as the Inbox's Needs you, and the view that draws its rows.
 * One feature adds each section; the shell draws its heading.
 */
export interface HomeCardContribution extends ViewRef {
  readonly id: HomeSection;
}

/** Adds a card to Home. */
export interface HomePoint {
  /**
   * Adds the card for one of Home's sections; the shell sets their order.
   *
   * @throws ShellError for an unknown section or one another feature added
   */
  addCard(card: HomeCardContribution): void;
}
