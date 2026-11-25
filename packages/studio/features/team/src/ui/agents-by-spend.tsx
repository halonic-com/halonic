import type { SpendRange } from "@halonicjs/ports";
import { FilterChips, ListHeading, usePresentation } from "@halonicjs/studio-kit";
import { useState } from "react";
import { teamDetailWords as words } from "../team-detail-words.ts";
import {
  type AgentRangesRow,
  type AgentSpendRow,
  agentsBySpendShown,
  type TeamDetails,
} from "../team-details.ts";
import { formatMoney } from "../team-format.ts";
import {
  Chevron,
  DetailFrame,
  OpenRow,
  pageKey,
  type TeamPage,
  useDetail,
} from "./detail-frame.tsx";

const ranges: readonly SpendRange[] = ["today", "week", "month"];

/** One row's words: "Mateo · $12.10 · Seat A"; an agent on no seat ends with its money. */
function rowWords({ agent, spend, seat }: AgentSpendRow): string {
  const parts = [agent.name ?? words.unknownAgent, formatMoney(spend.paid)];
  if (seat !== undefined) parts.push(seat.label);
  return parts.join(" · ");
}

/** The hint under the agents, so a seat agent's $ isn't read as real money (S1, S10). */
function ApiPricesHint() {
  return <p className="text-small text-fg-muted">{words.apiPricesHint}</p>;
}

/** The phone's "Agents by spend ›" heading: a button inside the heading, so it stays one (S24). */
function AllAgentsHeading({ onOpen }: { onOpen: () => void }) {
  return (
    <h2 data-opens={pageKey({ kind: "agents" })} className="px-4 pt-4 pb-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1 text-label uppercase text-fg-muted outline-none focus-ring"
      >
        {words.agentsBySpendPhone}
        <span aria-hidden="true">›</span>
      </button>
    </h2>
  );
}

/**
 * Agents by spend today on Spend and seats (S1): the top 5, each opening its agent, with
 * "See all ›" in the heading when more agents spent. On a phone only the heading,
 * "Agents by spend ›", which opens every agent: no list on the first screen (S24, HAL-17640).
 * Nothing while it reads.
 */
export function AgentsBySpendSection(props: {
  details: TeamDetails;
  onOpen: (page: TeamPage) => void;
}) {
  const { details } = props;
  const { shown } = useDetail(details, () => details.agentsBySpend(agentsBySpendShown), "top");
  const onPhone = usePresentation() === "phone";
  if (shown.kind !== "read" || shown.value.total === 0) return null;
  const { rows, total } = shown.value;
  const openAll = () => props.onOpen({ kind: "agents" });
  if (onPhone) {
    return (
      <section aria-label={words.agentsBySpend} className="flex flex-col gap-2">
        <AllAgentsHeading onOpen={openAll} />
      </section>
    );
  }
  return (
    <section aria-label={words.agentsBySpend} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <ListHeading name={words.agentsBySpend} />
        {rows.length < total ? (
          <span data-opens={pageKey({ kind: "agents" })} className="pe-4">
            <button
              type="button"
              onClick={openAll}
              className="inline-flex items-center gap-1 rounded-xs text-small text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-ring"
            >
              {words.seeAll}
              <Chevron />
            </button>
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.agent.id} data-opens={pageKey({ kind: "agent", id: row.agent.id })}>
            <OpenRow onOpen={() => props.onOpen({ kind: "agent", id: row.agent.id })}>
              {rowWords(row)}
            </OpenRow>
          </li>
        ))}
      </ul>
      <ApiPricesHint />
    </section>
  );
}

const cell = "px-3 py-2 text-start";
const moneyCell = "px-3 py-2 text-end tabular-nums";

/** One agent's row in the See all table; its name opens the agent. */
function AgentRangesLine(props: { row: AgentRangesRow; onOpen: (page: TeamPage) => void }) {
  const { agent, spend, seat } = props.row;
  return (
    <tr className="border-t border-border" data-opens={pageKey({ kind: "agent", id: agent.id })}>
      <th scope="row" className={cell}>
        <button
          type="button"
          onClick={() => props.onOpen({ kind: "agent", id: agent.id })}
          className="inline-flex items-center gap-1 rounded-xs text-start underline-offset-2 hover:underline focus-ring"
        >
          {agent.name ?? words.unknownAgent}
          <Chevron />
        </button>
      </th>
      {ranges.map((range) => {
        const paid = spend[range]?.paid;
        return (
          <td key={range} className={moneyCell}>
            {paid === undefined ? "—" : formatMoney(paid)}
          </td>
        );
      })}
      <td className={cell}>{seat?.label ?? "—"}</td>
    </tr>
  );
}

/**
 * See all (S10): every agent that spent, with its money today, this week and this month and its
 * seat, most paid first in the range the chips pick.
 */
export function AllAgentsPage(props: {
  details: TeamDetails;
  onOpen: (page: TeamPage) => void;
  onBack: () => void;
}) {
  const { details } = props;
  const [range, setRange] = useState<SpendRange>("today");
  const { shown, readAgain } = useDetail(details, () => details.agentsByRange(range), range);
  return (
    <DetailFrame
      shown={shown}
      title={() => words.allTitle}
      onBack={props.onBack}
      onTryAgain={readAgain}
    >
      {(rows) => (
        <>
          <FilterChips
            label={words.sortBy}
            flush
            options={ranges.map((value) => ({ value, label: words.range[value] }))}
            value={range}
            onChange={setRange}
          />
          <table className="w-full border-collapse text-body">
            <thead className="text-label uppercase text-fg-muted">
              <tr>
                <th scope="col" className={cell}>
                  {words.columns.agent}
                </th>
                {ranges.map((each) => (
                  <th key={each} scope="col" className="px-3 py-2 text-end">
                    {words.range[each]}
                  </th>
                ))}
                <th scope="col" className={cell}>
                  {words.columns.seat}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AgentRangesLine key={row.agent.id} row={row} onOpen={props.onOpen} />
              ))}
            </tbody>
          </table>
          <ApiPricesHint />
        </>
      )}
    </DetailFrame>
  );
}
