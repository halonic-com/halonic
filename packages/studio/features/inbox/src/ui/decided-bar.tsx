import { Button, Callout, type CalloutHandle, usePresentation } from "@halonicjs/studio-kit";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { PlainValue } from "./plain-value.tsx";

/**
 * After "Nothing else is waiting for you." on a phone, which can't show what the run did next: where
 * to see it (HAL-19399 G14).
 */
export const seeOnComputerText = "See what it did in Studio on your computer.";

/** The item after this one, for the decided card's **Next** (flow-inbox 5.3). */
export interface NextItem {
  readonly title: string;
  /** Items still waiting, this one not counted. */
  readonly left: number;
  readonly open: () => void;
}

/**
 * Where you came from, for the decided card's way back (flow-inbox 5.3, 8.2): a run's
 * **Review in Inbox** gives **Back to run 01JD8Q**, an agent chat's **Back to the chat with
 * Mailbot**. `null` when you opened the Inbox itself.
 */
export type BackLink =
  | {
      readonly kind: "run";
      /** The run's name as Studio shows it, such as `01JD8Q`. */
      readonly runName: string;
      readonly open: () => void;
    }
  | {
      readonly kind: "chat";
      /** The agent's name as the workspace shows it. */
      readonly agentName: string;
      readonly open: () => void;
    };

/** The way back's label: "Back to run 01JD8Q" or "Back to the chat with Mailbot" (microcopy 19). */
export function backLabel(back: BackLink): string {
  return back.kind === "run"
    ? `Back to run ${back.runName}`
    : `Back to the chat with ${back.agentName}`;
}

interface DecidedBarProps {
  readonly text: string;
  /** The note you sent, under `text` as plain text, folded when long. */
  readonly note?: string;
  readonly next: NextItem | null;
  readonly back: BackLink | null;
  readonly callout: RefObject<CalloutHandle | null>;
}

/**
 * The bar once decided: the decided Callout, which takes focus, then the way back, secondary,
 * and **Next** (flow-inbox 5.3). The way back stays when nothing else waits, so you're never
 * left without one.
 *
 * The Callout takes focus without scrolling, so the bar brings itself into view when it appears:
 * in a short window, where the whole column scrolls, the shorter bar would otherwise leave the
 * line below the window (HAL-13918). It scrolls whichever element scrolls the card, only as far
 * as it must: the whole bar when it fits, else from its top, so the line shows whole. It does so
 * before the bar is drawn, so the window never shows it out of view first. The effect returns
 * nothing: Chromium's `scrollIntoView` returns a promise, which React would take for a clean-up
 * and fail on when the bar goes away.
 *
 * **Next** opens the next card at its top (`openAtTop`). On a phone the row starts at the left, and
 * "Nothing else is waiting for you." goes on to say where to see what the run did,
 * {@link seeOnComputerText}.
 */
export function DecidedBar({ text, note, next, back, callout }: DecidedBarProps) {
  // On a phone Next takes the card's width and its label wraps, so a long title grows it taller,
  // never past the screen's edge (HAL-13801 IN1).
  const phone = usePresentation() === "phone";
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    bar.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  return (
    <div ref={bar} className="flex flex-col gap-3 border-t border-border p-4">
      <Callout tone="info" announce="focus" ref={callout}>
        {text}
        {note === undefined ? null : (
          <>
            {" "}
            <PlainValue text={note} />
          </>
        )}
      </Callout>
      <div
        className={`flex flex-wrap items-center gap-2 ${phone ? "justify-start" : "justify-end"}`}
      >
        {back === null ? null : <Button onClick={back.open}>{backLabel(back)}</Button>}
        {next === null ? (
          <p className="text-small text-fg-muted">
            Nothing else is waiting for you.{phone ? ` ${seeOnComputerText}` : null}
          </p>
        ) : (
          <Button
            variant="primary"
            size={phone ? "touch" : "md"}
            block={phone}
            name={`Next: ${next.title}, ${next.left} left`}
            onClick={() => openAtTop(bar.current, next.open)}
          >
            {/* One run of text, so a phone wraps it between words as a sentence (HAL-13830 IN2);
                no-break spaces keep "· 3 left" together. The name is given whole: a hidden span
                for the count got a space before its comma in Chromium (HAL-15105). */}
            <span>{`Next: ${next.title} ·\u00a0${next.left}\u00a0left`}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Opens another card from the decided bar at its top (HAL-13975). The new card takes this one's
 * place and its title takes focus without scrolling, so every element around the bar that may
 * scroll goes back to its top first. In a short window the one that scrolls is the whole phone
 * column, which would otherwise keep the scroll it had for this bar and leave the new title above
 * the window. It isn't the nearest that may scroll: the Inbox's item pane may, but there it grows
 * with the card. On a desktop the card's own body scrolls, which the new card starts afresh, so
 * nothing moves.
 */
function openAtTop(bar: HTMLElement | null, open: () => void) {
  for (let parent = bar?.parentElement ?? null; parent !== null; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") parent.scrollTop = 0;
  }
  open();
}
