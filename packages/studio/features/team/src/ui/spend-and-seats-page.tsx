import { useEffect, useState } from "react";
import { notReadAfterMs } from "../seat-problems.ts";
import type { SpendAndSeats, SpendAndSeatsState } from "../spend-and-seats.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { LinkButton, SpentTodayTile, ThisMonthTile } from "./money-tiles.tsx";
import { NeedsYou, SeatsTile, SeatTable } from "./seat-parts.tsx";

/** The props of {@link SpendAndSeatsPage}. */
export interface SpendAndSeatsPageProps {
  readonly spendAndSeats: SpendAndSeats;
  /** Opens a Paperclip page in the system browser, or the connection flow for "Connect again". */
  readonly onLink: (link: TeamLink) => void;
}

/**
 * What the page holds: still loading, the last good read, or a failed first
 * read. A read that fails after a good one keeps the good one, marked failed.
 */
type Shown =
  | { kind: "loading" }
  | { kind: "read"; state: SpendAndSeatsState | undefined; readAt: string; failed: boolean }
  | { kind: "failed" };

/**
 * The Spend and seats screen (requirement `team.spend-and-seats`, HAL-17515
 * renders S1–S9): Needs you, the money and seat tiles, and the seats worst
 * first. It reads when it opens, whenever a source says it changed, and on
 * **Try again** after a failed read, and shows each state of Sofia's table
 * 1.6 that `TeamStatus` can tell apart. It only shows: every action opens
 * Paperclip.
 */
export function SpendAndSeatsPage({ spendAndSeats, onLink }: SpendAndSeatsPageProps) {
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  // Grows on each change a source reports and on Try again, so the page reads again.
  const [changed, setChanged] = useState(0);
  const readAgain = () => setChanged((count) => count + 1);

  useEffect(() => spendAndSeats.watch(readAgain), [spendAndSeats]);

  useEffect(() => {
    let current = true;
    spendAndSeats.read().then(
      (state) => {
        const readAt = spendAndSeats.timeClock.now().toISOString();
        if (current) setShown({ kind: "read", state, readAt, failed: false });
      },
      (error: unknown) => {
        console.error("Spend and seats couldn't be read:", error);
        if (current) setShown((before) => failedAfter(before));
      },
    );
    return () => {
      current = false;
    };
  }, [spendAndSeats, changed]);

  const clock = spendAndSeats.timeClock;
  if (shown.kind === "loading") {
    return (
      <main aria-busy="true" aria-label={teamWords.loadingSpoken}>
        <h1>{teamWords.title}</h1>
        <p>{teamWords.loading}</p>
      </main>
    );
  }
  if (shown.kind === "failed") {
    return (
      <main>
        <h1>{teamWords.title}</h1>
        <p role="alert">
          {teamWords.notAnswering} <TryAgain onPress={readAgain} />
        </p>
      </main>
    );
  }
  const state = shown.state;
  if (state === undefined) {
    return (
      <main>
        <h1>{teamWords.title}</h1>
        <p>{teamWords.seatsMissing}</p>
        <LinkButton link="paperclip" onLink={onLink} />
      </main>
    );
  }
  return (
    <ReadScreen
      state={state}
      failed={shown.failed}
      readAt={shown.readAt}
      clock={clock}
      onLink={onLink}
      onTryAgain={readAgain}
    />
  );
}

/** A failed read keeps what the screen already showed; with nothing shown yet, it says so. */
function failedAfter(before: Shown): Shown {
  return before.kind === "read" ? { ...before, failed: true } : { kind: "failed" };
}

function TryAgain({ onPress }: { onPress: () => void }) {
  return (
    <button type="button" className="text-small text-accent" onClick={onPress}>
      {teamWords.tryAgain}
    </button>
  );
}

/** The time of the oldest of these readings, compared as times, not as text. */
function oldestOf(times: readonly string[]): string | undefined {
  return [...times].sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

/** The screen with a read: freshness, the warnings, Needs you, the tiles and the seats. */
function ReadScreen(props: {
  state: SpendAndSeatsState;
  failed: boolean;
  /** When the last successful read landed: the offline banner's time. */
  readAt: string;
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
  onTryAgain: () => void;
}) {
  const { state, failed, clock, onLink } = props;
  // A signed-out seat's stamp is when it signed out, not a reading's age.
  const readSeats = state.seats.filter((seat) => seat.state !== "signed-out");
  const oldest = oldestOf(readSeats.map((seat) => seat.asOf));
  const seatsAreOld =
    oldest !== undefined && clock.now().getTime() - Date.parse(oldest) >= notReadAfterMs;
  return (
    <main className="flex flex-col gap-3 p-3">
      <header className="flex justify-between">
        <h1>{teamWords.title}</h1>
        {state.asOf === undefined ? null : (
          <p className="text-small text-fg-muted">
            {seatsAreOld ? "⚠ " : ""}
            {teamWords.asOf(formatTime(state.asOf, clock), minutesSince(state.asOf, clock))}
          </p>
        )}
      </header>
      {failed ? (
        <p role="alert">
          {teamWords.offline(formatTime(props.readAt, clock))}{" "}
          <TryAgain onPress={props.onTryAgain} />
        </p>
      ) : null}
      {seatsAreOld && oldest !== undefined ? (
        <p role="status">
          {teamWords.oldReadings(minutesSince(oldest, clock))}{" "}
          <LinkButton link="ai-seats" onLink={onLink} />
        </p>
      ) : null}
      {state.hasSeats ? <NeedsYou problems={state.problems} clock={clock} /> : null}
      <div className="flex gap-2">
        {state.canReadSpend ? (
          <>
            <SpentTodayTile today={state.today} />
            <ThisMonthTile month={state.month} clock={clock} onLink={onLink} />
          </>
        ) : (
          <p>
            {teamWords.cantReadSpend} <LinkButton link="connect-again" onLink={onLink} />
          </p>
        )}
        <SeatsTile seats={state.seats} problems={state.problems} clock={clock} />
      </div>
      <SeatsSection state={state} clock={clock} onLink={onLink} />
    </main>
  );
}

/** The seats, or why there are none: no AI seats plugin, or no seats set up in it. */
function SeatsSection(props: {
  state: SpendAndSeatsState;
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
}) {
  const { state, clock, onLink } = props;
  return (
    <section aria-label={teamWords.seatsHeading}>
      <h2>{teamWords.seatsHeading}</h2>
      <SeatsBody state={state} clock={clock} onLink={onLink} />
    </section>
  );
}

function SeatsBody(props: {
  state: SpendAndSeatsState;
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
}) {
  const { state, clock, onLink } = props;
  if (!state.hasSeats) {
    return (
      <p>
        {teamWords.seatsMissing} <LinkButton link="paperclip" onLink={onLink} />
      </p>
    );
  }
  if (state.seats.length === 0) {
    return (
      <p>
        {teamWords.noSeats} <LinkButton link="ai-seats" onLink={onLink} />
      </p>
    );
  }
  return <SeatTable seats={state.seats} clock={clock} />;
}
