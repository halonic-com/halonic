import type { MessagingId, Seat } from "@halonicjs/ports";
import { ListHeading, StatusChip } from "@halonicjs/studio-kit";
import type { SeatProblem, SeatProblemKind } from "../seat-problems.ts";
import { formatDayTime, formatTime, type TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { pageKey } from "./detail-pages.tsx";
import { LinkRow, RowChevron } from "./link-row.tsx";
import { Amount, SmallLine, Tile } from "./money-tiles.tsx";
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
  const lines = [
    teamWords.nearLimit(near),
    ...(signedOut > 0 ? [teamWords.signedOutCount(signedOut)] : []),
    ...(refill === undefined ? [] : [teamWords.nextRefill(formatDayTime(refill, props.clock))]),
  ];
  return (
    <Tile title={teamWords.seatsThisWeek}>
      <Amount value={teamWords.percent(Math.round(100 - used))} after={teamWords.ofPoolLeft} />
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
      return notReadWords(seat, clock);
    case "signed-out":
      return teamWords.state[seat.state](formatTime(seat.asOf, clock));
    default:
      return teamWords.state[seat.state]();
  }
}

/** A seat not read, with why its newest read failed when the cause has words. */
function notReadWords(seat: Seat, clock: TeamClock): string {
  const lastGood = formatTime(seat.asOf, clock);
  const cause =
    seat.failedRead === undefined ? undefined : teamWords.readCause[seat.failedRead.cause];
  return cause === undefined
    ? teamWords.state["not-read"](lastGood)
    : teamWords.notReadBecause(cause, lastGood);
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
 * The week: on a desktop a meter, with a near-limit seat's forecast under it; on a phone only the
 * percent. A seat with no week shows a dash.
 */
function WeekCell({ seat, clock }: { seat: Seat; clock: TeamClock }) {
  const week = seat.windows.find((each) => each.kind === "week");
  if (week === undefined) return <span className={numberCell}>—</span>;
  const forecast =
    seat.state === "near-limit" && week.reaches90At !== undefined
      ? teamWords.forecast90(formatTime(week.reaches90At, clock))
      : undefined;
  return (
    <span className="block min-w-0">
      <span className="block phone:hidden">
        <UsageMeter percent={week.usedPercent} />
        {forecast === undefined ? null : (
          <span className="block text-small text-attention">{forecast}</span>
        )}
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
 * A seat's name, "Seat C · pool": when it wraps, "· pool" moves under the label whole, so a line
 * never starts or ends with the separator.
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
          <span className="min-w-0 w-full wrap-anywhere text-body-strong">
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
 * The seats, worst first, under the "Seats · worst first" heading, with the column names above
 * them on a desktop. Each row opens the seat's page, or AI seats in Paperclip where there is none. A paid-API seat shows money's words
 * instead of a weekly limit.
 */
export function SeatList(props: {
  seats: readonly Seat[];
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
  onOpenSeat?: ((seat: MessagingId) => void) | undefined;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* The rows say each column's name to screen readers, so the heading row is for eyes only. */}
      <div
        aria-hidden="true"
        className={`${rowGrid} px-4 text-label uppercase text-fg-muted phone:hidden`}
      >
        {teamWords.seatColumns.map((column, index) => (
          <span key={column} className={index >= 3 ? "text-right" : undefined}>
            {column}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
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
      </ul>
    </div>
  );
}

/** The heading over the seats: "Seats · worst first". */
export function SeatsHeading() {
  return <ListHeading name={teamWords.seatsHeading} detail={teamWords.worstFirst} />;
}
