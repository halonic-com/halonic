import type { MessagingId, Seat } from "@halonicjs/ports";
import { ListHeading, StatusChip, usePresentation } from "@halonicjs/studio-kit";
import type { SeatProblem, SeatProblemKind } from "../seat-problems.ts";
import { formatDayTime, formatTime, type TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { pageKey } from "./detail-pages.tsx";
import { LinkRow, RowChevron, RowList } from "./link-row.tsx";
import { SmallLine, Tile } from "./money-tiles.tsx";
import { StateIcon, stateTones } from "./seat-state.tsx";
import { UsageMeter } from "./usage-meter.tsx";

/** The problems that count as near the limit: the tile uses Needs you's words, not the seat's state. */
const nearLimitKinds: readonly SeatProblemKind[] = ["reaches-90-soon", "at-90", "at-80"];

/** Seats this week: the pool's room left, the seats near their limit and signed out, the next refill. */
export function SeatsTile(props: {
  seats: readonly Seat[];
  problems: readonly SeatProblem[];
  clock: TeamClock;
}) {
  const phone = usePresentation() === "phone";
  const pool = props.seats.filter((seat) => seat.role === "pool");
  const readable = pool.filter((seat) => seat.state !== "signed-out" && seat.state !== "not-read");
  const weeks = readable.flatMap((seat) => seat.windows.filter((each) => each.kind === "week"));
  if (weeks.length === 0) return null;
  const used = weeks.reduce((sum, week) => sum + week.usedPercent, 0) / weeks.length;
  const near = props.problems.filter(
    (problem) => problem.seat.role === "pool" && nearLimitKinds.includes(problem.kind),
  ).length;
  const signedOut = pool.filter((seat) => seat.state === "signed-out").length;
  const refill = weeks
    .flatMap((week) => (week.resetsAt === undefined ? [] : [week.resetsAt]))
    .sort()[0];
  const nextRefill = phone ? teamWords.phone.nextRefill : teamWords.nextRefill;
  const lines = [
    teamWords.nearLimit(near),
    ...(signedOut > 0 ? [teamWords.signedOutCount(signedOut)] : []),
    ...(refill === undefined ? [] : [nextRefill(formatDayTime(refill, props.clock))]),
  ];
  const left = teamWords.percent(Math.round(100 - used));
  // A phone's row says "38% left" and "next refill" (S24), shortened from the tile's words.
  const headline = { value: left, after: phone ? teamWords.phone.left : teamWords.ofPoolLeft };
  return (
    <Tile title={teamWords.seatsThisWeek} headline={headline}>
      <SmallLine>{lines.join(" · ")}</SmallLine>
    </Tile>
  );
}

/** A seat's state in words, with the time that goes with it. A forecast goes under the meter. */
function stateWords(seat: Seat, clock: TeamClock): string {
  const week = seat.windows.find((window) => window.kind === "week");
  switch (seat.state) {
    case "full":
      return teamWords.state.full(
        week?.resetsAt === undefined ? undefined : formatDayTime(week.resetsAt, clock),
      );
    case "not-read":
      return notReadWords(seat);
    case "signed-out":
      return teamWords.state[seat.state](formatTime(seat.asOf, clock));
    default:
      return teamWords.state[seat.state]();
  }
}

/** A seat not read, with why its newest read failed when the cause has words. */
function notReadWords(seat: Seat): string {
  const cause =
    seat.failedRead === undefined ? undefined : teamWords.readCause[seat.failedRead.cause];
  return cause === undefined ? teamWords.state["not-read"]() : teamWords.notReadBecause(cause);
}

/** A seat's State: a StatusChip in the state's tone, with its symbol and always its words. */
export function SeatStateChip({ seat, clock }: { seat: Seat; clock: TeamClock }) {
  return (
    <StatusChip tone={stateTones[seat.state]} dot={seat.state === "ok"}>
      <span className="inline-flex items-center gap-1">
        <StateIcon state={seat.state} />
        {stateWords(seat, clock)}
      </span>
    </StatusChip>
  );
}

/**
 * A column's name before its value, for screen readers only: the heading row shows the names to
 * the eye, and on a phone the row shows only the name, State and week, as S24 does.
 */
function Spoken({ column }: { column: string }) {
  return <span className="sr-only">{column} </span>;
}

const [seatColumn, stateColumn, weekColumn, fiveHourColumn, agentsColumn] = teamWords.seatColumns;

/**
 * One row's grid, shared by the heading row and every seat row so the columns line up (s01): Seat
 * and State fixed shares, This week the flexible space. On a phone every row is the same one line,
 * as S24: name, State, the week's percent and ›; a long name wraps within its own cell.
 */
const rowGrid =
  "grid items-center gap-x-3 gap-y-1 grid-cols-[minmax(10rem,1fr)_minmax(13rem,1.2fr)_minmax(12rem,2fr)_6rem_5rem_1rem] phone:grid-cols-[minmax(0,1fr)_auto_3rem_1rem]";
const numberCell = "text-right text-small tabular-nums";
const desktopNumberCell = `${numberCell} phone:hidden`;

/**
 * Whether a seat's week numbers may be out of date, and the line under its greyed bar that says
 * since when: a signed-out seat's "last read 09:40", a seat whose read failed "last good 12:20"
 * (S1, S6).
 */
function staleLine(seat: Seat, clock: TeamClock): string | undefined {
  const time = formatTime(seat.asOf, clock);
  if (seat.state === "signed-out") return teamWords.lastRead(time);
  if (seat.state === "not-read" || seat.failedRead !== undefined) return teamWords.lastGood(time);
  return undefined;
}

/** The line under a week meter: an old reading's time, or a near-limit seat's forecast. */
function UnderMeter({ seat, clock }: { seat: Seat; clock: TeamClock }) {
  const stale = staleLine(seat, clock);
  if (stale !== undefined) return <span className="block text-small text-fg-muted">{stale}</span>;
  const week = seat.windows.find((each) => each.kind === "week");
  if (seat.state !== "near-limit" || week?.reaches90At === undefined) return null;
  return (
    <span className="block text-small text-attention">
      {teamWords.forecast90(formatTime(week.reaches90At, clock))}
    </span>
  );
}

/**
 * The week: on a desktop a meter, greyed with its time under it when the reading may be old, or
 * with a near-limit seat's forecast under it; on a phone only the percent. A seat with no week
 * shows a dash.
 */
function WeekCell({ seat, clock }: { seat: Seat; clock: TeamClock }) {
  const week = seat.windows.find((each) => each.kind === "week");
  if (week === undefined) {
    return (
      <span className="block min-w-0">
        <span className={`block ${numberCell}`}>—</span>
        <span className="block phone:hidden">
          <UnderMeter seat={seat} clock={clock} />
        </span>
      </span>
    );
  }
  return (
    <span className="block min-w-0">
      <span className="block phone:hidden">
        <UsageMeter percent={week.usedPercent} greyed={staleLine(seat, clock) !== undefined} />
        <UnderMeter seat={seat} clock={clock} />
      </span>
      <span className={`hidden phone:block ${numberCell}`}>
        {teamWords.percent(Math.round(week.usedPercent))}
      </span>
    </span>
  );
}

function fiveHours(seat: Seat): string {
  const window = seat.windows.find((each) => each.kind === "five-hour");
  return window === undefined ? "—" : teamWords.percent(Math.round(window.usedPercent));
}

/** A pool seat's State, week and five hours; a paid-API seat has money's words there instead. */
function SeatMiddle({ seat, clock }: { seat: Seat; clock: TeamClock }) {
  if (seat.role === "paid-api") {
    return (
      <span className="col-span-3 text-small text-fg-muted phone:col-span-2">
        {teamWords.paidApi}
      </span>
    );
  }
  return (
    <>
      <span className="min-w-0">
        <Spoken column={stateColumn ?? ""} />
        <SeatStateChip seat={seat} clock={clock} />
      </span>
      <span className="min-w-0">
        <Spoken column={weekColumn ?? ""} />
        <WeekCell seat={seat} clock={clock} />
      </span>
      <span className={desktopNumberCell}>
        <Spoken column={fiveHourColumn ?? ""} />
        {fiveHours(seat)}
      </span>
    </>
  );
}

/**
 * A seat's name, "Seat C · pool": on a desktop, when it wraps, "· pool" moves under the label
 * whole, so a line never starts or ends with the separator; on a phone it stays on one line and a
 * long one is cut with an ellipsis (S24).
 */
function SeatName({ seat }: { seat: Seat }) {
  const role = teamWords.seatRole(seat);
  if (role === undefined) return seat.label;
  return (
    <>
      {seat.label} <span className="whitespace-nowrap">{role}</span>
    </>
  );
}

/** A seat's row: its name, State chip, week meter, five hours and agents, then ›. */
function SeatRow(props: {
  seat: Seat;
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
  onOpenSeat: ((seat: MessagingId) => void) | undefined;
}) {
  const { seat, clock, onLink, onOpenSeat } = props;
  const openSeat = onOpenSeat === undefined ? undefined : () => onOpenSeat(seat.id);
  return (
    <LinkRow link="ai-seats" onLink={onLink} onOpenInApp={openSeat}>
      {(opens) => (
        // A failed read keeps the last good numbers, greyed (Sofia's table 1.6).
        <span className={seat.failedRead === undefined ? rowGrid : `${rowGrid} text-fg-muted`}>
          <span className="min-w-0 w-full wrap-anywhere text-body-strong phone:truncate">
            <Spoken column={seatColumn ?? ""} />
            <SeatName seat={seat} />
          </span>
          <SeatMiddle seat={seat} clock={clock} />
          <span className={desktopNumberCell}>
            <Spoken column={agentsColumn ?? ""} />
            {seat.agents.length}
          </span>
          {opens ? <RowChevron /> : <span />}
        </span>
      )}
    </LinkRow>
  );
}

/**
 * The seats, worst first, under the "Seats · worst first" heading: one bordered list with the
 * column names at its top on a desktop (s01). Each row opens the seat's page, or AI seats in Paperclip where there is none. A paid-API seat shows money's words
 * instead of a weekly limit.
 */
export function SeatList(props: {
  seats: readonly Seat[];
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
  onOpenSeat?: ((seat: MessagingId) => void) | undefined;
}) {
  return (
    <RowList
      head={
        // The rows say each column's name to screen readers, so the heading row is for eyes only.
        <div
          aria-hidden="true"
          className={`${rowGrid} px-4 py-2 text-label uppercase text-fg-muted phone:hidden`}
        >
          {teamWords.seatColumns.map((column, index) => (
            <span key={column} className={index >= 3 ? "text-right" : undefined}>
              {column}
            </span>
          ))}
        </div>
      }
    >
      {props.seats.map((seat) => (
        <li key={seat.id} data-opens={pageKey({ kind: "seat", id: seat.id })}>
          <SeatRow
            seat={seat}
            clock={props.clock}
            onLink={props.onLink}
            onOpenSeat={props.onOpenSeat}
          />
        </li>
      ))}
    </RowList>
  );
}

/** The heading over the seats: "Seats · worst first", and on a phone "Seats · this week" (S24). */
export function SeatsHeading() {
  const phone = usePresentation() === "phone";
  const detail = phone ? teamWords.phone.thisWeek : teamWords.worstFirst;
  return <ListHeading name={teamWords.seatsHeading} detail={detail} />;
}
