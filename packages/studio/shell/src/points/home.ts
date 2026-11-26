import type { ViewRef } from "../view.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { PlaceSignal } from "./frame.ts";

/**
 * Home's sections, in the only order they are shown (design direction 3, UX checklist 1.9):
 * Problems while a file has an error (C348 A6), Get set up while setup isn't done, Needs you,
 * Recent runs, Spend, then the plugins' Cards (plugins D3, HAL-1801). A section whose feature
 * hasn't added its card isn't shown.
 */
export const homeSections = [
  "problems",
  "setup",
  "needs-you",
  "recent-runs",
  "spend",
  "cards",
] as const;

/** One of Home's sections. */
export type HomeSection = (typeof homeSections)[number];

/**
 * Each section's heading, which also names its region (microcopy 3.3). The shell owns them, as it
 * owns the places' names, so a section is called the same whichever feature adds its card.
 */
export const homeSectionTitles: Readonly<Record<HomeSection, string>> = {
  problems: "Problems",
  setup: "Get set up",
  "needs-you": "Needs you",
  "recent-runs": "Recent runs",
  spend: "Spend",
  cards: "Cards",
};

/**
 * A card on Home: one section, such as the Inbox's Needs you, and the view that draws its rows.
 * One feature adds each section; the shell draws its heading.
 */
export interface HomeCardContribution extends ViewRef {
  readonly id: HomeSection;
  /**
   * The heading to show in place of the section's own, such as "Try the sample" for Get set up in
   * the Acme sample, or `undefined` for the section's own. Read each time Home draws.
   */
  title?(context: WorkspaceContext): string | undefined;
  /**
   * The section's count now, shown after its heading as a place's is after its name ("Needs you,
   * 1 waiting"), or `undefined` for none. Nothing shows at zero.
   */
  signal?(context: WorkspaceContext): PlaceSignal | undefined;
  /**
   * The colour of that count: `warning` draws it in the Needs you violet, as the Runs group and the
   * Messenger do (`shell.home-signal-tone`); without it, the heading's own muted colour.
   */
  readonly signalTone?: "warning";
  /**
   * Calls `listener` whenever the signal may have changed, so the heading reads `signal` again.
   * Returns a function that stops the calls.
   */
  subscribeSignal?(context: WorkspaceContext, listener: () => void): () => void;
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
