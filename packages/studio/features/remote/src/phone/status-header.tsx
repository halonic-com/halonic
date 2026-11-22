import { HeaderBadge } from "@halonicjs/studio-kit";
import { useEffect, useMemo, useState } from "react";
import { type PhoneState, PhoneStatusTracker, phoneStatusLabel } from "./phone-status.ts";

/** How often a Reconnecting label checks whether it has lasted long enough to be said (G19). */
export const STATUS_TICK_MS = 500;

export interface PhoneStatusHeaderProps {
  /** The connection's newest state (`phoneStatusLabelState`). */
  readonly state: PhoneState;
  /** The computer's own name: "Tim's laptop". */
  readonly computer: string;
  /**
   * The label was tapped, with the state it shows. The page opens the detail sheet, or for
   * Removed and Can't confirm, which have no sheet, moves focus to the screen's heading.
   */
  readonly onOpen: (shown: PhoneState) => void;
  /** The phone's clock in milliseconds; `Date.now` unless a test sets it. Keep it stable. */
  readonly clock?: () => number;
}

/**
 * The phone's connection label in its top bar (`s-m1`) and its one polite live region, outside
 * the button (strings table on HAL-12233, "Announcements"). `PhoneStatusTracker` decides what the
 * label shows and what is said: a quick blip says nothing, and a background retry while Can't
 * reach or offline doesn't turn the label back to Reconnecting (G19, G20). Another computer starts
 * a new tracker, so its first state says nothing either.
 */
export function PhoneStatusHeader({
  state,
  computer,
  onOpen,
  clock = Date.now,
}: PhoneStatusHeaderProps) {
  const tracker = useMemo(() => new PhoneStatusTracker(computer), [computer]);
  const [shown, setShown] = useState<PhoneState>(state);
  // What was said, with the tracker that said it: another computer's words aren't left behind.
  const [said, setSaid] = useState<{ readonly by: PhoneStatusTracker; readonly text: string }>();

  useEffect(() => {
    const change = tracker.change(state, clock());
    setShown(change.shown);
    if (change.announce !== undefined) setSaid({ by: tracker, text: change.announce });
  }, [tracker, state, clock]);

  // Reconnecting is said only once it has lasted 2 seconds, so only then is there a clock to run.
  useEffect(() => {
    if (shown !== "reconnecting") return;
    const timer = setInterval(() => {
      const announce = tracker.tick(clock());
      if (announce !== undefined) setSaid({ by: tracker, text: announce });
    }, STATUS_TICK_MS);
    return () => clearInterval(timer);
  }, [tracker, shown, clock]);

  const label = phoneStatusLabel(shown, computer);
  return (
    <div className="flex min-w-0 items-center">
      <HeaderBadge
        as="status"
        tone={label.tone}
        action="Details"
        name={label.name}
        onClick={() => onOpen(shown)}
      >
        {label.text}
      </HeaderBadge>
      <p role="status" className="sr-only">
        {said?.by === tracker ? said.text : ""}
      </p>
    </div>
  );
}
