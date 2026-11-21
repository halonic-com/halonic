import { type ReactNode, useEffect, useState } from "react";
import { lineActionClasses } from "../line-frame/line-frame.tsx";

/** Nothing shows before this: a button's own busy state covers the first two seconds. */
export const WAITING_LINE_AFTER_MS = 2_000;

/** The reason joins the line at this point, never earlier. */
export const WAITING_REASON_AFTER_MS = 10_000;

/**
 * Where the line sits. `inline` stands on its own in a page's flow (Welcome, a setup step);
 * `row` sits in a row's text column, under its title and hint; `banner` is a box above a page's
 * content (the run page).
 */
export type WaitingLinePlacement = "inline" | "row" | "banner";

/** One way out of the wait, drawn as a text button: "Something wrong?", "Pick another model". */
export interface WaitingLineAction {
  /** A verb or a question that says what happens. */
  readonly label: string;
  readonly onClick: () => void;
}

/** The props of `WaitingLine`. */
export interface WaitingLineProps {
  /**
   * What Studio waits for, named, never "Please wait": "Waiting for Anthropic", "Starting
   * Halonic…". An address may be code: `<>Checking Ollama at <code>localhost:11434</code>…</>`.
   */
  readonly what: ReactNode;
  /** How long it has waited so far, from `useWaitedMs`. Nothing shows before 2 seconds. */
  readonly waitedMs: number;
  /**
   * Why the wait can be long, only when it's known ("It loads the model first, so the start is
   * slow."). It shows from 10 seconds. A later sentence for the same wait replaces it.
   */
  readonly reason?: string;
  /** The ways out the line offers itself. An escalation changes them; it never adds a second line. */
  readonly actions?: readonly WaitingLineAction[];
  readonly placement?: WaitingLinePlacement;
  /**
   * The reasons and action labels this wait will show, when they're known from the start: the line
   * keeps room for the tallest of them from the moment it shows, so their coming moves nothing on
   * screen at any width (Welcome's start, first-run-progress 5).
   */
  readonly keepRoomFor?: WaitingLineRoom;
}

/** What a WaitingLine keeps room for: every reason it may show, and its actions' labels. */
export interface WaitingLineRoom {
  readonly reasons: readonly string[];
  readonly actions: readonly string[];
}

const noRoom: WaitingLineRoom = { reasons: [], actions: [] };

/** One grid cell for every child, so it is as high as the tallest of them. */
const oneCell = "grid *:col-start-1 *:row-start-1";

const actionRowClasses = "flex flex-wrap gap-x-4 gap-y-1";

const placementClasses: Record<WaitingLinePlacement, string> = {
  inline: "flex items-start gap-2 text-small",
  row: "flex items-start gap-2 pt-1 text-small",
  banner:
    "flex items-start gap-2 rounded-md border border-border bg-surface-muted px-4 py-3 text-small",
};

/**
 * The time waited, in seconds below a minute ("14 s") and as m:ss from a minute ("2:10"). Never a
 * bar: Studio doesn't know how long the wait will be.
 */
export function waitedTime(waitedMs: number): string {
  const seconds = Math.floor(Math.max(0, waitedMs) / 1000);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The milliseconds since `since`, drawn again every second. Call it in the small component that
 * draws the WaitingLine, so only that redraws each second, not the page.
 */
export function useWaitedMs(since: Date, now: () => Date = () => new Date()): number {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((count) => count + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, now().getTime() - since.getTime());
}

/**
 * The one line Studio shows wherever it waits (first-run-progress, section 2): a still dot in the
 * running colour, what it waits for, the time waited, the reason when known, and its ways out.
 *
 * Mount it when the wait starts and keep it while the wait lasts. Before 2 seconds it draws
 * nothing, but its status region is already there, so screen readers hear the line when it
 * appears and again when its words change (the reason at 10 s, an escalation), never each second:
 * the time sits outside the status region. The dot never pulses, so there is nothing for reduced
 * motion to stop; the counting time is the sign of life.
 *
 * @example
 * const waitedMs = useWaitedMs(startedAt);
 * <WaitingLine
 *   placement="banner"
 *   waitedMs={waitedMs}
 *   what="Waiting for Ollama on this computer"
 *   reason="It loads the model first, so the start is slow."
 * />
 */
export function WaitingLine({
  what,
  waitedMs,
  reason,
  actions = [],
  placement = "inline",
  keepRoomFor = noRoom,
}: WaitingLineProps) {
  const shown = waitedMs >= WAITING_LINE_AFTER_MS;
  const reasonShown = reason !== undefined && waitedMs >= WAITING_REASON_AFTER_MS;
  return (
    // The same element before and after 2 s, so the status region inside it stays the same node.
    <div className={shown ? placementClasses[placement] : "sr-only"}>
      {shown ? (
        // As high as one line of text-small, so the dot sits in the middle of the first line.
        <span aria-hidden="true" className="flex h-5 shrink-0 items-center">
          <span className="size-1.5 rounded-full bg-running forced-color-adjust-none forced-colors:bg-[CanvasText]" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className={oneCell}>
          <div role="status">
            {shown ? (
              <>
                <p className="wrap-break-word text-fg">{what}</p>
                {reasonShown ? <p className="wrap-break-word text-fg-muted">{reason}</p> : null}
              </>
            ) : null}
          </div>
          {shown
            ? keepRoomFor.reasons.map((each) => (
                // `invisible` keeps the box and hides it from screen readers, the pointer and Tab.
                <div key={each} aria-hidden="true" className="invisible">
                  <p className="wrap-break-word">{what}</p>
                  <p className="wrap-break-word">{each}</p>
                </div>
              ))
            : null}
        </div>
        {shown ? <ActionRow actions={actions} room={keepRoomFor.actions} /> : null}
      </div>
      {shown ? (
        <span className="shrink-0 text-fg-muted tabular-nums">{waitedTime(waitedMs)}</span>
      ) : null}
    </div>
  );
}

/** The line's actions as text buttons, over the unseen labels it keeps room for. */
function ActionRow({
  actions,
  room,
}: {
  readonly actions: readonly WaitingLineAction[];
  readonly room: readonly string[];
}) {
  if (actions.length === 0 && room.length === 0) {
    return null;
  }
  return (
    <div className={`mt-1 ${oneCell}`}>
      <div className={actionRowClasses}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={lineActionClasses}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
      {room.length === 0 ? null : (
        <div aria-hidden="true" className={`invisible ${actionRowClasses}`}>
          {room.map((label) => (
            <span key={label} className={lineActionClasses}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
