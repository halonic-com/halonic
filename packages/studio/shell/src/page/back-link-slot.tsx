import { createContext, type ReactNode, useContext } from "react";

const BackLinkSlot = createContext<ReactNode>(null);

/**
 * Hands a tab's back link to the `ItemPage` its kind's view draws (`shell.page-back-link`), so the
 * page can put it inside its own column, above the header. Beside the scroller it would add its
 * height to a chat page that is already as tall as the tab.
 */
export const BackLinkSlotProvider = BackLinkSlot.Provider;

/** The back link the tab's page was given, or nothing. */
export function useBackLinkSlot(): ReactNode {
  return useContext(BackLinkSlot);
}

/**
 * Draws the tab's back link. A kind's view that doesn't render `ItemPage` puts this above its own
 * title, so the link doesn't drop off that page.
 */
export function PageBackLinkSlot() {
  return <>{useBackLinkSlot()}</>;
}
