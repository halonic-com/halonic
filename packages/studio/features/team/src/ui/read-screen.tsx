import { Callout, ListHeading, usePresentation } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { notReadAfterMs } from "../seat-problems.ts";
import type { SpendAndSeatsState } from "../spend-and-seats.ts";
import type { TeamDetails } from "../team-details.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { AgentsBySpendSection } from "./agents-by-spend.tsx";
import type { TeamPage } from "./detail-frame.tsx";
import { LinkButton, SpentTodayTile, ThisMonthTile } from "./money-tiles.tsx";
import { NeedsYou } from "./needs-you.tsx";
import { SeatList, SeatsHeading, SeatsTile } from "./seat-parts.tsx";

/** The time of the oldest of these readings, compared as times, not as text. */
function oldestOf(times: readonly string[]): string | undefined {
  return [...times].sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

/** The oldest seat reading, and whether it is old enough to warn about. */
function oldReadings(state: SpendAndSeatsState, clock: TeamClock) {
  // A signed-out seat's stamp is when it signed out, not a reading's age. One seat's failed read
  // shows in its own row only (Sofia's table 1.6): the page warns when all readings are old.
  const readSeats = state.seats.filter(
    (seat) => seat.state !== "signed-out" && seat.failedRead === undefined,
  );
  const oldest = oldestOf(readSeats.map((seat) => seat.asOf));
  const seatsAreOld =
    oldest !== undefined && clock.now().getTime() - Date.parse(oldest) >= notReadAfterMs;
  return { oldest, seatsAreOld };
}

/** When the last good read landed, the screen being offline: the screen's offline banner's time. */
export function lastGoodRead(state: SpendAndSeatsState, failed: boolean, readAt: string) {
  // Offline when a read failed after a good one, or when the engine answered from its cache.
  if (!failed && state.offlineAsOf === undefined) return undefined;
  // The newest cached answer's time, else the screen's last read.
  return state.offlineAsOf ?? readAt;
}

/**
 * The frame's freshness slot for a read: "As of 13:00 · 2 min ago", with ⚠ when seats are old;
 * offline, "As of 12:58 · offline" with the last good read's time (wording, Shared).
 */
export function readFreshness(
  state: SpendAndSeatsState,
  clock: TeamClock,
  read: { failed: boolean; readAt: string },
): string | undefined {
  const lastGood = lastGoodRead(state, read.failed, read.readAt);
  if (lastGood !== undefined) return teamWords.asOfOffline(formatTime(lastGood, clock));
  if (state.asOf === undefined) return undefined;
  const warn = oldReadings(state, clock).seatsAreOld ? "⚠ " : "";
  return `${warn}${teamWords.asOf(formatTime(state.asOf, clock), minutesSince(state.asOf, clock))}`;
}

/**
 * The screen's body with a read, inside the page's frame: the warnings, Needs you, the tiles and
 * the seats.
 */
export function ReadBody(props: {
  state: SpendAndSeatsState;
  failed: boolean;
  /** When the last successful read landed: the offline banner's time. */
  readAt: string;
  /** The offline banner's words' id, which the page's off link buttons name as their reason. */
  bannerId: string;
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
  onTryAgain: () => void;
  /** Where the detail pages are: Agents by spend shows and seat rows open their page. */
  pages?: { details: TeamDetails; onOpen: (page: TeamPage) => void } | undefined;
}) {
  const { state, failed, clock, onLink, pages } = props;
  const { oldest, seatsAreOld } = oldReadings(state, clock);
  const lastGood = lastGoodRead(state, failed, props.readAt);
  return (
    <>
      {/* Always on the page, so the offline words are read out when a later read fails. The
          kit draws Try again only while the banner has words. */}
      <Callout
        tone="attention"
        announce="polite"
        action={{ label: teamWords.tryAgain, onClick: props.onTryAgain }}
      >
        {/* The off link buttons name these words as their reason. */}
        {lastGood === undefined ? null : (
          <span id={props.bannerId}>{teamWords.offline(formatTime(lastGood, clock))}</span>
        )}
      </Callout>
      {seatsAreOld && oldest !== undefined ? (
        <Callout tone="attention">
          <span className="flex flex-col items-start gap-2">
            <span>{teamWords.oldReadings(minutesSince(oldest, clock))}</span>
            <LinkButton link="ai-seats" onLink={onLink} />
          </span>
        </Callout>
      ) : null}
      {state.hasSeats && state.seats.length > 0 ? (
        <NeedsYou problems={state.problems} clock={clock} onLink={onLink} />
      ) : null}
      <MoneyAndSeats>
        {state.canReadSpend ? (
          <>
            <SpentTodayTile today={state.today} />
            <ThisMonthTile month={state.month} clock={clock} onLink={onLink} />
          </>
        ) : (
          <div className="min-w-0 flex-2">
            <Callout tone="attention">
              <span className="flex flex-col items-start gap-2">
                <span>{teamWords.cantReadSpend}</span>
                <LinkButton link="connect-again" onLink={onLink} />
              </span>
            </Callout>
          </div>
        )}
        <SeatsTile seats={state.seats} problems={state.problems} clock={clock} />
      </MoneyAndSeats>
      <section aria-label={teamWords.seatsHeading} className="flex flex-col gap-2">
        <SeatsHeading />
        <SeatsBody state={state} clock={clock} onLink={onLink} pages={pages} />
      </section>
      {state.canReadSpend ? <AgentsBySpendSlot pages={pages} /> : null}
    </>
  );
}

/**
 * Where the tiles go: one row of tiles on a desktop; on a phone, rows under the "Money and seats"
 * heading (S24).
 */
function MoneyAndSeats({ children }: { children: ReactNode }) {
  if (usePresentation() === "phone") {
    return (
      <section aria-label={teamWords.moneyAndSeats} className="flex flex-col">
        <ListHeading name={teamWords.moneyAndSeats} />
        {children}
      </section>
    );
  }
  return <div className="flex gap-3">{children}</div>;
}

/** Agents by spend, where the detail pages are. */
function AgentsBySpendSlot(props: {
  pages: { details: TeamDetails; onOpen: (page: TeamPage) => void } | undefined;
}) {
  if (props.pages === undefined) return null;
  return <AgentsBySpendSection details={props.pages.details} onOpen={props.pages.onOpen} />;
}

/** The seats, or why there are none: no AI seats plugin, or no seats set up in it. */
function SeatsBody(props: {
  state: SpendAndSeatsState;
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
  pages: { onOpen: (page: TeamPage) => void } | undefined;
}) {
  const { state, clock, onLink, pages } = props;
  if (!state.hasSeats) {
    return <NoSeatsLine words={teamWords.seatsMissing} link="paperclip" onLink={onLink} />;
  }
  if (state.seats.length === 0) {
    return <NoSeatsLine words={teamWords.noSeats} link="ai-seats" onLink={onLink} />;
  }
  const onOpen = pages?.onOpen;
  const onOpenSeat =
    onOpen === undefined ? undefined : (id: string) => onOpen({ kind: "seat", id });
  return <SeatList seats={state.seats} clock={clock} onLink={onLink} onOpenSeat={onOpenSeat} />;
}

/** Why there are no seats to show, and the button to Paperclip that fixes it. */
export function NoSeatsLine(props: {
  words: string;
  link: TeamLink;
  onLink: (link: TeamLink) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-4">
      <p className="text-small text-fg-muted">{props.words}</p>
      <LinkButton link={props.link} onLink={props.onLink} />
    </div>
  );
}
