import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { AskSessionService, type AskWindow, AskWindowService } from "../api.ts";
import type { AskSession } from "../ask-session.ts";
import { AskBox } from "./ask-box.tsx";

/** A window that can't hide or open Studio, as in the served Studio: the box still asks. */
const noWindow: AskWindow = {
  hide: async () => undefined,
  openStudio: async () => undefined,
};

/**
 * The focused app `ask`: the box in the window quick ask's keys show (requirement
 * `quick-ask.box`). The shell hides that window rather than closing it, so the box goes when the
 * window is hidden or loses the focus, which stops watching for an answer, and comes back empty
 * each time it shows: the conversation itself lives in Messenger.
 */
export function AskBoxWindow({ context }: PlaceViewProps) {
  return (
    <AskBoxWhileShown
      session={context.services.get(AskSessionService)}
      window={context.services.find(AskWindowService) ?? noWindow}
      page={globalThis.window}
    />
  );
}

/** The props of {@link AskBoxWhileShown}. */
export interface AskBoxWhileShownProps {
  readonly session: AskSession;
  readonly window: AskWindow;
  /** The page's window, whose focus and visibility say whether the box shows. */
  readonly page: Window;
}

/** The box while its window shows, made afresh each time it shows again. */
export function AskBoxWhileShown({ session, window, page }: AskBoxWhileShownProps) {
  // A window made hidden, as the shell makes the box's, shows the box only once it shows.
  const [shown, setShown] = useState<number | undefined>(() =>
    page.document.visibilityState === "hidden" ? undefined : 0,
  );
  useShowing(page, setShown);
  if (shown === undefined) return null;
  // Closed from the box (Esc, a click beside it): gone at once, even before the window hides.
  return (
    <AskBox key={shown} session={session} window={window} onClosed={() => setShown(undefined)} />
  );
}

/**
 * Keeps `shown` as how many times the window has shown, or `undefined` while it's hidden or
 * another app has the focus. The shell hides the box's window when another app takes the focus,
 * and the page hears that as a blur or as the document going hidden; it shows it again with the
 * focus.
 */
function useShowing(
  page: Window,
  setShown: (change: (now: number | undefined) => number | undefined) => void,
): void {
  useEffect(() => {
    let count = 0;
    const show = () =>
      setShown((now) => {
        if (now !== undefined) return now;
        count += 1;
        return count;
      });
    const hide = () => setShown(() => undefined);
    const onVisibility = () => (page.document.visibilityState === "hidden" ? hide() : show());
    page.addEventListener("focus", show);
    page.addEventListener("blur", hide);
    page.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      page.removeEventListener("focus", show);
      page.removeEventListener("blur", hide);
      page.document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [page, setShown]);
}
