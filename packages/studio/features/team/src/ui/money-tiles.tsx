import type { SpendSummary } from "@halonicjs/ports";
import type { ReactNode } from "react";
import {
  allTokens,
  formatDate,
  formatMoney,
  formatTokens,
  monthDay,
  type TeamClock,
} from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";

const dayMs = 24 * 60 * 60 * 1000;

/** A tile of the Spend and seats screen: its title, then its lines. */
export function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex-1 rounded-lg border border-border p-3">
      <h2 className="text-small text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

/** A button that opens a page outside the app, or the connection flow. */
export function LinkButton({ link, onLink }: { link: TeamLink; onLink: (link: TeamLink) => void }) {
  return (
    <button type="button" className="text-small text-accent" onClick={() => onLink(link)}>
      {teamWords.links[link]}
    </button>
  );
}

/**
 * Spent today: paid money, "at least" while runs aren't priced, and the
 * tokens line the board chose for S1 (HAL-17544), so subscription work
 * shows its size without being priced.
 */
export function SpentTodayTile({ today }: { today: SpendSummary | undefined }) {
  if (today === undefined) return null;
  const money = formatMoney(today.paid);
  return (
    <Tile title={teamWords.spentToday}>
      {today.unpricedRuns > 0 ? (
        <p>
          {teamWords.atLeast(money)} · {teamWords.notPriced(today.unpricedRuns)}
        </p>
      ) : (
        <p>{money}</p>
      )}
      <p className="text-small text-fg-muted">
        {teamWords.tokensToday(formatTokens(allTokens(today.tokens)))}
      </p>
    </Tile>
  );
}

/** This month: spent against the budget, what's left, and where the pace leads. */
export function ThisMonthTile(props: {
  month: SpendSummary | undefined;
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
}) {
  const { month, clock, onLink } = props;
  if (month === undefined) return null;
  const spent = formatMoney(month.paid, true);
  if (month.budget === undefined) {
    return (
      <Tile title={teamWords.thisMonth}>
        <p>
          {teamWords.monthNoBudget(spent)} · {teamWords.noBudget}
        </p>
        <LinkButton link="set-budget" onLink={onLink} />
      </Tile>
    );
  }
  const budget = month.budget;
  const percent = Math.round((month.paid.cents / budget.cents) * 100);
  const head = `${teamWords.monthOfBudget(spent, formatMoney(budget, true))} · ${teamWords.percent(percent)}`;
  if (month.paid.cents >= budget.cents) {
    return (
      <Tile title={teamWords.thisMonth}>
        <p>{head}</p>
        <p>{teamWords.budgetUsedUp}</p>
      </Tile>
    );
  }
  const { day, daysInMonth } = monthDay(clock);
  const left = formatMoney({ ...budget, cents: budget.cents - month.paid.cents }, true);
  return (
    <Tile title={teamWords.thisMonth}>
      <p>{head}</p>
      <p>
        {teamWords.left(left)} · {teamWords.daysToGo(daysInMonth - day)}
      </p>
      <p>{paceLine(month, day, daysInMonth, clock)}</p>
    </Tile>
  );
}

/** Where this month's daily pace leads: a total, or the day it passes the budget. */
function paceLine(month: SpendSummary, day: number, daysInMonth: number, clock: TeamClock): string {
  const perDay = month.paid.cents / day;
  const projected = perDay * daysInMonth;
  const budget = month.budget?.cents ?? Number.POSITIVE_INFINITY;
  if (projected <= budget) {
    return teamWords.atThisPace(formatMoney({ ...month.paid, cents: projected }, true));
  }
  const daysToBudget = Math.ceil((budget - month.paid.cents) / perDay);
  const passes = new Date(clock.now().getTime() + daysToBudget * dayMs);
  return teamWords.passesBudget(formatDate(passes, clock));
}
