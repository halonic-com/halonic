/**
 * The phone's connection state as its header label shows it, and what the
 * phone says out loud when it changes (tunnel strings table on HAL-12233:
 * "Status label in the header" and "Announcements"). The phone only knows
 * its own side: a timeout or a refused connection is never `removed`.
 */

/** The six states of the phone's header label (design decision 16). */
export type PhoneState =
  | "connected"
  | "reconnecting"
  | "unreachable"
  | "phoneOffline"
  | "removed"
  | "cantConfirm";

/** The kit's `HeaderBadge` tones for `as="status"`. */
export type PhoneStatusTone = "success" | "waiting" | "attention" | "danger";

/** One state of the header label. */
export interface PhoneStatusLabel {
  /** The words on the label: "Connected · Tim's laptop". */
  readonly text: string;
  readonly tone: PhoneStatusTone;
  /** What a screen reader says, without where it leads: "Connected to Tim's laptop". */
  readonly said: string;
  /** The button's name: the state, then "Details". */
  readonly name: string;
}

const DETAILS = "Details";

const label = (text: string, tone: PhoneStatusTone, said = text): PhoneStatusLabel => ({
  text,
  tone,
  said,
  name: `${said}. ${DETAILS}`,
});

/** The header label for a state. Colour never carries it alone: every state has words. */
export function phoneStatusLabel(state: PhoneState, computer: string): PhoneStatusLabel {
  switch (state) {
    case "connected":
      return label(`Connected · ${computer}`, "success", `Connected to ${computer}`);
    case "reconnecting":
      return label("Reconnecting…", "waiting", "Reconnecting");
    case "unreachable":
      return label("Can't reach your computer", "attention");
    case "phoneOffline":
      return label("Your phone is offline", "attention");
    case "removed":
      return label("Removed from this computer", "danger");
    case "cantConfirm":
      return label("Can't confirm your computer", "danger");
  }
}

/** A quick blip shorter than this says nothing (G19). */
export const RECONNECTING_QUIET_MS = 2000;

/** What the tracker did with one change: the state to show, and what to say, if anything. */
export interface PhoneStatusChange {
  readonly shown: PhoneState;
  readonly announce?: string | undefined;
}

/**
 * Follows the connection's state for the header label and its one polite
 * live region:
 *
 * - The first state says nothing: the header is read with the screen.
 * - Connected → Reconnecting is said only once it has lasted 2 seconds
 *   ({@link tick}); retries are never said.
 * - While Can't reach or offline, a background retry doesn't turn the label
 *   back to Reconnecting (G19).
 * - Any other trouble state is said at once, with the label's words.
 * - Back to Connected is said only if the trouble before it was (G20).
 */
export class PhoneStatusTracker {
  private shown: PhoneState | undefined;
  private reconnectingSince: number | undefined;
  private troubleSaid = false;
  private readonly computer: string;

  constructor(computer: string) {
    this.computer = computer;
  }

  /** The state the label shows now; `undefined` before the first change. */
  get state(): PhoneState | undefined {
    return this.shown;
  }

  /** Takes the connection's newest state, at `nowMs`. */
  change(next: PhoneState, nowMs: number): PhoneStatusChange {
    const before = this.shown;
    if (before === undefined) {
      this.shown = next;
      return { shown: next };
    }
    if (next === "reconnecting" && (before === "unreachable" || before === "phoneOffline")) {
      return { shown: before };
    }
    if (next === before) return { shown: before };
    this.shown = next;
    this.reconnectingSince = undefined;
    if (next === "connected") {
      const said = this.troubleSaid;
      this.troubleSaid = false;
      return said ? { shown: next, announce: this.said(next) } : { shown: next };
    }
    if (next === "reconnecting") {
      this.reconnectingSince = nowMs;
      return { shown: next };
    }
    this.troubleSaid = true;
    return { shown: next, announce: this.said(next) };
  }

  /**
   * Called as time passes: says Reconnecting once it has lasted
   * {@link RECONNECTING_QUIET_MS}, and only once.
   */
  tick(nowMs: number): string | undefined {
    const since = this.reconnectingSince;
    if (since === undefined || nowMs - since < RECONNECTING_QUIET_MS) return undefined;
    this.reconnectingSince = undefined;
    this.troubleSaid = true;
    return this.said("reconnecting");
  }

  private said(state: PhoneState): string {
    return phoneStatusLabel(state, this.computer).said;
  }
}
