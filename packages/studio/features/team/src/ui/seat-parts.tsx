import type { Seat } from "@halonicjs/ports";
import type { SeatProblem } from "../seat-problems.ts";
import { formatDayTime, formatTime, type TeamClock } from "../team-format.ts";
import { teamWords } from "../team-words.ts";
import { Tile } from "./money-tiles.tsx";

/** A Needs you row's two lines: what is wrong, then when and who it affects. */
function problemLines(problem: SeatProblem, clock: TeamClock): [string, string] {
  const { seat, week } = problem;
  const words = teamWords.problem;
  const agents = teamWords.agentsOn(seat.agents.length);
  const resets = week?.resetsAt === undefined ? undefined : formatDayTime(week.resetsAt, clock);
  const withResets = resets === undefined ? agents : `${words.resets(resets)} · ${agents}`;
  const lastRead = formatTime(seat.asOf, clock);
  switch (problem.kind) {
    case "full":
      // With no reset time known, the row says only the state, never "full until" nothing.
      return [
        resets === undefined
          ? `${seat.label} · ${teamWords.state.full()}`
          : words.full(seat.label, resets),
        agents,
      ];
    case "signed-out":
      return [words.signedOut(seat.label), `${words.since(lastRead)} · ${agents}`];
    case "not-read":
      return [words.notRead(seat.label), `${words.lastGood(lastRead)} · ${agents}`];
    case "reaches-90-soon":
      return [words.reaches90(seat.label, formatTime(week?.reaches90At ?? "", clock)), withResets];
    case "at-90":
    case "at-80":
      return [words.used(seat.label, Math.round(week?.usedPercent ?? 0)), withResets];
  }
}

/** Needs you: one row per seat problem, worst first, or one line when nothing needs the board. */
export function NeedsYou(props: { problems: readonly SeatProblem[]; clock: TeamClock }) {
  const { problems, clock } = props;
  return (
    <section aria-label={teamWords.needsYou}>
      <h2>
        {teamWords.needsYou}
        {problems.length > 0 ? ` · ${teamWords.problemCount(problems.length)}` : ""}
      </h2>
      {problems.length === 0 ? (
        <p>{teamWords.nothingNeedsYou}</p>
      ) : (
        <ul>
          {problems.map((problem) => {
            const [title, line] = problemLines(problem, clock);
            return (
              <li key={problem.seat.id}>
                <strong>{title}</strong> / {line}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Seats this week: the pool's room left, the seats near their limit and signed out, the next refill. */
export function SeatsTile(props: { seats: readonly Seat[]; clock: TeamClock }) {
  const pool = props.seats.filter((seat) => seat.role === "pool");
  const readable = pool.filter((seat) => seat.state !== "signed-out" && seat.state !== "not-read");
  const weeks = readable.flatMap((seat) => seat.windows.filter((each) => each.kind === "week"));
  if (weeks.length === 0) return null;
  const used = weeks.reduce((sum, week) => sum + week.usedPercent, 0) / weeks.length;
  const near = pool.filter((seat) => seat.state === "near-limit").length;
  const signedOut = pool.filter((seat) => seat.state === "signed-out").length;
  const refill = weeks
    .flatMap((week) => (week.resetsAt === undefined ? [] : [week.resetsAt]))
    .sort()[0];
  const lines = [
    teamWords.poolLeft(Math.round(100 - used)),
    teamWords.nearLimit(near),
    ...(signedOut > 0 ? [teamWords.signedOutCount(signedOut)] : []),
    ...(refill === undefined ? [] : [teamWords.nextRefill(formatDayTime(refill, props.clock))]),
  ];
  return (
    <Tile title={teamWords.seatsThisWeek}>
      <p>{lines.join(" · ")}</p>
    </Tile>
  );
}

/** A seat's state in words, with the time that goes with it. */
function stateWords(seat: Seat, clock: TeamClock): string {
  const week = seat.windows.find((window) => window.kind === "week");
  const timeOf = (at: string | undefined) => (at === undefined ? undefined : formatTime(at, clock));
  switch (seat.state) {
    case "near-limit":
      return teamWords.state["near-limit"](timeOf(week?.reaches90At));
    case "full":
      return teamWords.state.full(
        week?.resetsAt === undefined ? undefined : formatDayTime(week.resetsAt, clock),
      );
    case "signed-out":
    case "not-read":
      return teamWords.state[seat.state](timeOf(seat.asOf));
    default:
      return teamWords.state[seat.state]();
  }
}

/** One window's use, such as "84%", or a dash when the seat has no such window. */
function usedIn(seat: Seat, kind: "week" | "five-hour"): string {
  const window = seat.windows.find((each) => each.kind === kind);
  return window === undefined ? "—" : teamWords.percent(Math.round(window.usedPercent));
}

/** The seats, worst first. A paid-API seat shows money's words instead of a weekly limit. */
export function SeatTable(props: { seats: readonly Seat[]; clock: TeamClock }) {
  return (
    <table>
      <thead>
        <tr>
          {teamWords.seatColumns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.seats.map((seat) => (
          <tr key={seat.id}>
            <td>{teamWords.seatName(seat)}</td>
            {seat.role === "paid-api" ? (
              <td colSpan={3}>{teamWords.paidApi}</td>
            ) : (
              <>
                <td>{stateWords(seat, props.clock)}</td>
                <td>{usedIn(seat, "week")}</td>
                <td>{usedIn(seat, "five-hour")}</td>
              </>
            )}
            <td>{seat.agents.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
