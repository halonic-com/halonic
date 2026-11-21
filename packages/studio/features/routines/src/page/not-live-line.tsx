import { inlineLinkClasses, usePresentation, useToastStore } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { failureReason, pageWords, runDialogWords } from "./page-words.ts";

/** Props for {@link NotLiveLine}. */
export interface NotLiveLineProps {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  /** Reads the routine again, since a version changes no file and so nothing else tells the page. */
  readonly readAgain: () => void;
  /**
   * Called once the line goes after **Review and make live** made a version, so the page can give
   * the focus the link had to the routine's name.
   */
  readonly onMadeLive: () => void;
}

/**
 * The quiet "Changes not live yet" line under the routine's summary, only while its saved changes
 * aren't in a version (`routines.page.frame-and-states`). Where the host can make the routine live,
 * the line ends in **Review and make live** (`routines.page.review-and-make-live`, microcopy 2),
 * which opens Create version with only this routine and reads the routine again once a version is
 * made. When the line then goes, `onMadeLive` moves the focus the link had. On a phone the link
 * sits at the right of the line, and under the words when both don't fit, as on the agent page.
 */
export function NotLiveLine({ host, routine, readAgain, onMadeLive }: NotLiveLineProps) {
  const phone = usePresentation() === "phone";
  const toasts = useToastStore();
  // Set when Review and make live made a version, until the line has gone.
  const madeLive = useRef(false);
  const shown = routine.changesNotLive;
  useEffect(() => {
    if (shown || !madeLive.current) return;
    madeLive.current = false;
    onMadeLive();
  }, [shown, onMadeLive]);
  if (!shown) return null;

  async function reviewAndMakeLive() {
    try {
      if ((await host.makeLive?.(routine)) !== "made") return;
      madeLive.current = true;
      readAgain();
    } catch (error) {
      toasts?.show({
        tone: "danger",
        title: runDialogWords.couldntMakeLive(routine.name),
        text: failureReason(error),
      });
    }
  }

  return (
    <p
      className={`text-small text-fg-muted ${phone ? "flex flex-wrap items-center justify-between gap-x-4" : ""}`}
    >
      {pageWords.changesNotLive}
      {host.makeLive !== undefined && (
        <>
          {" "}
          <button
            type="button"
            className={inlineLinkClasses}
            onClick={() => void reviewAndMakeLive()}
          >
            {pageWords.reviewAndMakeLive}
          </button>
        </>
      )}
    </p>
  );
}
