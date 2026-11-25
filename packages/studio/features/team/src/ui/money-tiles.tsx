import type { SpendSummary } from "@halonicjs/ports";
import { AlertIcon, Button, Card, WarningIcon } from "@halonicjs/studio-kit";
import { createContext, type ReactNode, useContext } from "react";
import {
  allTokens,
  formatDate,
  formatMoney,
  formatTokens,
  monthDay,
  type TeamClock,
} from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { UsageMeter } from "./usage-meter.tsx";

const dayMs = 24 * 60 * 60 * 1000;

/**
 * A tile of the Spend and seats screen: a Card with its title as a plain small caption, then its
 * lines (s01). The Card fills the tile, so every tile in a row ends at the same height.
 */
export function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 *:min-w-0 *:flex-1">
      <Card>
        <section className="flex flex-col gap-1" aria-label={title}>
          <h2 className="text-small text-fg-muted">{title}</h2>
          {children}
        </section>
      </Card>
    </div>
  );
}

/** A tile's headline: the amount, large and in tabular figures, with muted words after it. */
export function Amount({ value, after }: { value: string; after?: string }) {
  return (
    <p className="wrap-anywhere">
      <span className="text-title tabular-nums">{value}</span>
      {after === undefined ? null : <span className="text-body text-fg-muted"> {after}</span>}
    </p>
  );
}

/** A secondary line under a tile's headline. */
export function SmallLine({ children }: { children: ReactNode }) {
  return <p className="text-small text-fg-muted">{children}</p>;
}

/**
 * A line that asks for a look (amber, the kit's `attention`) or says something stopped (red), with
 * the tone's icon before it.
 */
export function ToneLine({
  tone,
  children,
}: {
  tone: "attention" | "danger";
  children: ReactNode;
}) {
  const colour = tone === "danger" ? "text-danger" : "text-attention";
  return (
    <p className={`flex items-start gap-1.5 text-small ${colour}`}>
      <span aria-hidden="true" className="mt-0.5 inline-grid size-icon-sm shrink-0 *:size-full">
        {tone === "danger" ? <AlertIcon /> : <WarningIcon />}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * Whether the screen's link buttons work: `on`; off while the Offline banner
 * shows, since Paperclip isn't answering, with the banner's id as the reason;
 * `none` where nothing can open a Paperclip page, so no button is drawn that
 * would do nothing.
 */
export type TeamLinksState = "on" | "none" | { readonly offBecause: string };

/** The link buttons' state for everything under it; `on` unless a screen says otherwise. */
export const TeamLinks = createContext<TeamLinksState>("on");

/**
 * A button that opens a page outside the app, or the connection flow; ↗ marks a page outside.
 * `label` names it where the link's usual name isn't the one, such as the page header's.
 */
export function LinkButton(props: {
  link: TeamLink;
  onLink: (link: TeamLink) => void;
  label?: string;
}) {
  const { link, onLink } = props;
  const state = useContext(TeamLinks);
  if (state === "none") return null;
  const leaves = link !== "connect-again";
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={leaves ? <span className="leading-none">↗</span> : undefined}
      unavailable={state === "on" ? undefined : { reason: state.offBecause }}
      onClick={() => onLink(link)}
    >
      {props.label ?? teamWords.links[link]}
    </Button>
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
  const unpriced = today.unpricedRuns > 0;
  return (
    <Tile title={teamWords.spentToday}>
      <Amount value={unpriced ? teamWords.atLeast(money) : money} />
      {unpriced ? (
        <ToneLine tone="attention">{teamWords.notPriced(today.unpricedRuns)}</ToneLine>
      ) : null}
      <SmallLine>{teamWords.tokensToday(formatTokens(allTokens(today.tokens)))}</SmallLine>
      {today.unknownSeatRuns === undefined || today.unknownSeatRuns === 0 ? null : (
        <SmallLine>{teamWords.seatUnknown(today.unknownSeatRuns)}</SmallLine>
      )}
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
        <Amount value={spent} after={teamWords.thisMonthAfter} />
        <SmallLine>{teamWords.noBudget}</SmallLine>
        <div className="mt-1">
          <LinkButton link="set-budget" onLink={onLink} />
        </div>
      </Tile>
    );
  }
  const budget = month.budget;
  const percent = (month.paid.cents / budget.cents) * 100;
  const head = (
    <>
      <Amount value={spent} after={teamWords.ofBudget(formatMoney(budget, true))} />
      <UsageMeter percent={percent} />
    </>
  );
  if (month.paid.cents >= budget.cents) {
    return (
      <Tile title={teamWords.thisMonth}>
        {head}
        <ToneLine tone="danger">{teamWords.budgetUsedUp}</ToneLine>
      </Tile>
    );
  }
  const { day, daysInMonth } = monthDay(clock);
  const left = formatMoney({ ...budget, cents: budget.cents - month.paid.cents }, true);
  const pace = paceLine(month, day, daysInMonth, clock);
  return (
    <Tile title={teamWords.thisMonth}>
      {head}
      <SmallLine>
        {teamWords.left(left)} · {teamWords.daysToGo(daysInMonth - day)}
      </SmallLine>
      {pace.passes ? (
        <ToneLine tone="attention">{pace.words}</ToneLine>
      ) : (
        <SmallLine>{pace.words}</SmallLine>
      )}
    </Tile>
  );
}

/** Where this month's daily pace leads: a total, or the day it passes the budget. */
function paceLine(
  month: SpendSummary,
  day: number,
  daysInMonth: number,
  clock: TeamClock,
): { words: string; passes: boolean } {
  const perDay = month.paid.cents / day;
  const projected = perDay * daysInMonth;
  const budget = month.budget?.cents ?? Number.POSITIVE_INFINITY;
  if (projected <= budget) {
    const words = teamWords.atThisPace(formatMoney({ ...month.paid, cents: projected }, true));
    return { words, passes: false };
  }
  const daysToBudget = Math.ceil((budget - month.paid.cents) / perDay);
  const passes = new Date(clock.now().getTime() + daysToBudget * dayMs);
  return { words: teamWords.passesBudget(formatDate(passes, clock)), passes: true };
}
