import type { SeatState } from "@halonicjs/ports";
import { ListHeading } from "@halonicjs/studio-kit";
import type { SeatProblem } from "../seat-problems.ts";
import { formatDayTime, formatTime, type TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { LinkRow, RowChevron, RowList } from "./link-row.tsx";
import { StateIcon } from "./seat-state.tsx";

/**
 * A Needs you row's two lines: what is wrong, then when and who it affects. The wording table
 * writes them as "title / second line"; the "/" only marks the break, so it's never shown.
 */
export function problemLines(problem: SeatProblem, clock: TeamClock): [string, string] {
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

/** The seat state a problem stands for: a seat at or nearing 90% is near its limit. */
const problemStates: Record<SeatProblem["kind"], SeatState> = {
  full: "full",
  "signed-out": "signed-out",
  "not-read": "not-read",
  "reaches-90-soon": "near-limit",
  "at-90": "near-limit",
  "at-80": "near-limit",
};

/** A problem's icon: the same symbol and tone as its seat's State chip below. */
function ProblemIcon({ kind }: { kind: SeatProblem["kind"] }) {
  return <StateIcon state={problemStates[kind]} coloured className="mt-0.5 size-icon-sm" />;
}

/**
 * Needs you: one bordered list with a row per seat problem (s01), worst first, or one line when nothing needs the
 * board. Each row opens AI seats in Paperclip, where the seat is fixed, when links are on. Only for a team with seats.
 */
export function NeedsYou(props: {
  problems: readonly SeatProblem[];
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
}) {
  const { problems, clock, onLink } = props;
  const count = problems.length > 0 ? teamWords.problemCount(problems.length) : undefined;
  return (
    <section aria-label={teamWords.needsYou} className="flex flex-col gap-2">
      <ListHeading name={teamWords.needsYou} detail={count} />
      {problems.length === 0 ? (
        <p className="px-4 text-small text-fg-muted">{teamWords.nothingNeedsYou}</p>
      ) : (
        <RowList>
          {problems.map((problem) => {
            const [title, line] = problemLines(problem, clock);
            return (
              <li key={problem.seat.id}>
                <LinkRow link="ai-seats" onLink={onLink}>
                  {(opens) => (
                    <span className="flex items-start gap-3">
                      <ProblemIcon kind={problem.kind} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-strong wrap-anywhere">{title}</span>
                        <span className="sr-only">, </span>
                        <span className="text-small text-fg-muted">{line}</span>
                      </span>
                      {opens ? <RowChevron className="shrink-0 self-center" /> : null}
                    </span>
                  )}
                </LinkRow>
              </li>
            );
          })}
        </RowList>
      )}
    </section>
  );
}
