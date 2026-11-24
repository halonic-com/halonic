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

/** What the page holds: still loading, nothing to show, or a read. */
type Shown = { kind: "loading" } | { kind: "read"; state: SpendAndSeatsState | undefined };

/**
 * The Spend and seats screen (requirement `team.spend-and-seats`, HAL-17515
 * renders S1–S9): Needs you, the money and seat tiles, and the seats worst
 * first. It reads when it opens and whenever a source says it changed, and
 * shows each state of Sofia's table 1.6 that `TeamStatus` can tell apart.
 * It only shows: every action opens Paperclip.
 */
export function SpendAndSeatsPage({ spendAndSeats, onLink }: SpendAndSeatsPageProps) {
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  // Grows on each change a source reports, so the page reads again.
  const [changed, setChanged] = useState(0);

  useEffect(() => spendAndSeats.watch(() => setChanged((count) => count + 1)), [spendAndSeats]);

  useEffect(() => {
    let current = true;
    spendAndSeats.read().then(
      (state) => {
        if (current) setShown({ kind: "read", state });
      },
      (error: unknown) => console.error("Spend and seats couldn't be read:", error),
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
  const oldest = state.seats.map((seat) => seat.asOf).sort()[0];
  const seatsAreOld =
    oldest !== undefined && minutesSince(oldest, clock) * 60 * 1000 >= notReadAfterMs;
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
        <SeatsTile seats={state.seats} clock={clock} />
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
