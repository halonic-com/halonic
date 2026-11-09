import { createContext, type ReactNode, useContext } from "react";

/**
 * How the Studio is laid out: `desktop` (and the compact layout, 600px and up) or `phone` (below
 * `PHONE_MAX_WIDTH`). The shell decides it once from the width; components never read the width.
 */
export type Presentation = "desktop" | "phone";

const PresentationContext = createContext<Presentation>("desktop");

export interface PresentationProviderProps {
  readonly presentation: Presentation;
  readonly children: ReactNode;
}

/**
 * Sets the presentation for everything inside it. The shell puts one at its root, from
 * `matchMedia` with `PHONE_MAX_WIDTH`; a test sets it directly.
 *
 * @example
 * <PresentationProvider presentation={isPhone ? "phone" : "desktop"}>
 *   <App />
 * </PresentationProvider>
 */
export function PresentationProvider({ presentation, children }: PresentationProviderProps) {
  return <PresentationContext value={presentation}>{children}</PresentationContext>;
}

/**
 * The presentation set by the nearest `PresentationProvider`, or `desktop` without one. For a
 * part that becomes a different element or a different layout on a phone (Select, Dialog, Tabs,
 * Side panel). A size change is a `phone:` class instead, with no JavaScript.
 */
export function usePresentation(): Presentation {
  return useContext(PresentationContext);
}
