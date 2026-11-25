import type { AgentSpend, MessagingId, Seat, SeatWindow, SpendRange } from "@halonicjs/ports";
import { Card, ListHeading, StatusChip } from "@halonicjs/studio-kit";
import { teamDetailWords as words } from "../team-detail-words.ts";
import type { AgentLine, TeamDetails } from "../team-details.ts";
import {
  formatDate,
  formatDayTime,
  formatMoney,
  formatTime,
  formatTokens,
  type TeamClock,
} from "../team-format.ts";
import { teamWords } from "../team-words.ts";
import { DetailFrame, OpenRow, type TeamPage, useDetail } from "./detail-frame.tsx";
import { Tile } from "./money-tiles.tsx";
import { SeatStateChip } from "./seat-parts.tsx";
import { StateIcon, stateTones } from "./seat-state.tsx";
import { UsageMeter } from "./usage-meter.tsx";

/** An agent's name, status word and task, as one line on its seat's page. */
function agentWords(agent: AgentLine): string {
  const parts = [agent.name ?? words.unknownAgent];
  if (agent.activity !== undefined) parts.push(words.activity[agent.activity]);
  if (agent.work !== undefined) parts.push(agent.work.label);
  return parts.join(" · ");
}

/** Under an agent's name (S11, S13): "Works on HAL-17508 · Working", or "No task right now · Idle". */
function agentHeader(agent: AgentLine): string {
  const parts = [agent.work === undefined ? words.noTask : words.worksOn(agent.work.label)];
  if (agent.activity !== undefined) parts.push(words.activity[agent.activity]);
  return parts.join(" · ");
}

const ranges: readonly SpendRange[] = ["today", "week", "month"];

/** One range's money as a tile; this month's shows the agent's own budget after it. */
function MoneyTile({ range, spend }: { range: SpendRange; spend: AgentSpend }) {
  const budget = range === "month" ? spend.budget : undefined;
  const after =
    budget === undefined || budget.cents === 0
      ? undefined
      : words.ofBudget(
          formatMoney(budget, true),
          Math.round((spend.paid.cents / budget.cents) * 100),
        );
  return <Tile title={words.range[range]} headline={{ value: formatMoney(spend.paid), after }} />;
}

/** One agent (S11–S13): its task and status, money by range as tiles, its seat and tokens by model. */
export function AgentDetailPage(props: {
  details: TeamDetails;
  id: MessagingId;
  onBack: () => void;
}) {
  const { details, id } = props;
  const { shown, readAgain } = useDetail(details, () => details.agent(id), id);
  return (
    <DetailFrame
      shown={shown}
      title={({ agent }) => agent.name ?? words.unknownAgent}
      onBack={props.onBack}
      onTryAgain={readAgain}
    >
      {({ agent, spend, seat }) => (
        <>
          <p>{agentHeader(agent)}</p>
          <div className="flex gap-3 phone:flex-col">
            {ranges.map((range) => {
              const answer = spend[range];
              return answer === undefined ? null : (
                <MoneyTile key={range} range={range} spend={answer} />
              );
            })}
          </div>
          <p>{seat === undefined ? words.noSeat : words.onSeat(seat.label)}</p>
          {spend.week === undefined || spend.week.tokensByModel.length === 0 ? null : (
            <section aria-label={words.tokensByModel} className="flex flex-col gap-1">
              <ListHeading name={words.tokensByModel} />
              {spend.week.tokensByModel.map(({ model, tokens }) => (
                <p key={model} className="tabular-nums">
                  {`${model}  ${words.tokens(formatTokens(tokens.input), formatTokens(tokens.cached), formatTokens(tokens.output))}`}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </DetailFrame>
  );
}

/**
 * A seat's state under its title (S14–S17). Near its limit, the chip carries the forecast,
 * "Near limit: reaches 90% around 16:40"; every other state is the seat list's chip.
 */
function SeatTitleChip({ seat, clock }: { seat: Seat; clock: TeamClock }) {
  const reaches90At = seat.windows.find((each) => each.kind === "week")?.reaches90At;
  if (seat.state !== "near-limit" || reaches90At === undefined) {
    return <SeatStateChip seat={seat} clock={clock} />;
  }
  return (
    <StatusChip tone={stateTones[seat.state]}>
      <span className="inline-flex items-center gap-1">
        <StateIcon state={seat.state} />
        {words.nearLimitUntil(formatTime(reaches90At, clock))}
      </span>
    </StatusChip>
  );
}

/** A window's line under its meter: "84% · resets Thu 09:00 · ↗ reaches 90% around 16:40". */
function windowWords(window: SeatWindow, clock: TeamClock): string {
  return [
    teamWords.percent(Math.round(window.usedPercent)),
    window.resetsAt && words.resets(formatDayTime(window.resetsAt, clock)),
    window.reaches90At && words.reaches90(formatTime(window.reaches90At, clock)),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Limits (S14): each window with its meter, then the manual reset. */
function LimitsCard({ seat, clock }: { seat: Seat; clock: TeamClock }) {
  const usedAt = typeof seat.manualReset === "object" ? seat.manualReset.usedAt : undefined;
  const resetDate = usedAt === undefined ? "" : formatDate(new Date(usedAt), clock);
  return (
    <Card label={words.limits} headingLevel={2}>
      <ul className="flex flex-col gap-3">
        {seat.windows.map((window) => (
          <li
            key={`${window.kind}-${window.label}`}
            className="grid grid-cols-[8rem_1fr] gap-2 phone:grid-cols-1"
          >
            <span>{window.label}</span>
            <span className="flex flex-col">
              <UsageMeter percent={window.usedPercent} />
              <span className="text-small text-fg-muted">{windowWords(window, clock)}</span>
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[8rem_1fr] gap-2 phone:grid-cols-1">
          <span>{words.manualReset}</span>
          <span>{words.manualResetState(seat.manualReset, seat.manualResetGroup, resetDate)}</span>
        </li>
      </ul>
    </Card>
  );
}

/** One seat (S14–S18): its state, Limits, its agents and the Seat Supervisor's proposal. */
export function SeatDetailPage(props: {
  details: TeamDetails;
  id: MessagingId;
  onOpen: (page: TeamPage) => void;
  onBack: () => void;
}) {
  const { details, id } = props;
  const clock = details.timeClock;
  const { shown, readAgain } = useDetail(details, () => details.seat(id), id);
  return (
    <DetailFrame
      shown={shown}
      title={({ seat }) => words.seatTitle(seat)}
      onBack={props.onBack}
      onTryAgain={readAgain}
    >
      {({ seat, agents }) => (
        <>
          <div>
            <SeatTitleChip seat={seat} clock={clock} />
          </div>
          <LimitsCard seat={seat} clock={clock} />
          <section
            aria-label={words.agentsOnSeat(seat.label, agents.length)}
            className="flex flex-col gap-2"
          >
            <ListHeading name={words.agentsOnSeat(seat.label, agents.length)} />
            {agents.length === 0 ? <p>{words.noAgents}</p> : null}
            <ul className="flex flex-col gap-2">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <OpenRow onOpen={() => props.onOpen({ kind: "agent", id: agent.id })}>
                    {agentWords(agent)}
                  </OpenRow>
                </li>
              ))}
            </ul>
          </section>
          {seat.proposal === undefined ? null : (
            <section aria-label={words.proposes} className="flex flex-col gap-1">
              <ListHeading
                name={words.proposes}
                detail={words.proposedAt(formatTime(seat.proposal.at, clock))}
              />
              <p>{seat.proposal.text}</p>
              <p className="text-small text-fg-muted">{words.proposalHint}</p>
            </section>
          )}
        </>
      )}
    </DetailFrame>
  );
}
