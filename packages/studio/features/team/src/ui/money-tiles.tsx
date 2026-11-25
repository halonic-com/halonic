import type { SpendSummary } from "@halonicjs/ports";
import { AlertIcon, Button, Card, usePresentation, WarningIcon } from "@halonicjs/studio-kit";
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

/** A tile's headline: the amount, and muted words after it on a desktop ("$977" "of $1,500"). */
export interface Headline {
  readonly value: string;
  readonly after?: string | undefined;
}

/**
 * A tile of the Spend and seats screen. On a desktop, a Card with its title as a plain small
 * caption, then its headline and lines; the Card fills the tile, so every tile in a row ends at the
 * same height (s01). On a phone, a row under the "Money and seats" heading (S24): the title on the
 * left, the headline on the right in one colour, and the lines under them.
 */
export function Tile(props: { title: string; headline: Headline; children?: ReactNode }) {
  const { title, headline, children } = props;
  if (usePresentation() === "phone") {
    const amount =
      headline.after === undefined ? headline.value : `${headline.value} ${headline.after}`;
    return (
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-body text-fg-muted">{title}</h3>
          <p className="text-title tabular-nums wrap-anywhere">{amount}</p>
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 *:min-w-0 *:flex-1">
      <Card>
        <section className="flex flex-col gap-1" aria-label={title}>
          <h2 className="text-small text-fg-muted">{title}</h2>
          <Amount value={headline.value} after={headline.after} />
          {children}
        </section>
      </Card>
    </div>
  );
}

/** A tile's headline: the amount, large and in tabular figures, with muted words after it. */
function Amount({ value, after }: Headline) {
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
    <Tile
      title={teamWords.spentToday}
      headline={{ value: unpriced ? teamWords.atLeast(money) : money }}
    >
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
  const phone = usePresentation() === "phone";
  if (month === undefined) return null;
  const spent = formatMoney(month.paid, true);
  if (month.budget === undefined) {
    return (
      <Tile
        title={teamWords.thisMonth}
        headline={{ value: spent, after: teamWords.thisMonthAfter }}
      >
        <SmallLine>{teamWords.noBudget}</SmallLine>
        <div className="mt-1">
          <LinkButton link="set-budget" onLink={onLink} />
        </div>
      </Tile>
    );
  }
  const budget = month.budget;
  const headline = { value: spent, after: teamWords.ofBudget(formatMoney(budget, true)) };
  const meter = <UsageMeter percent={(month.paid.cents / budget.cents) * 100} />;
  if (month.paid.cents >= budget.cents) {
    return (
      <Tile title={teamWords.thisMonth} headline={headline}>
        {meter}
        <ToneLine tone="danger">{teamWords.budgetUsedUp}</ToneLine>
      </Tile>
    );
  }
  const { day, daysInMonth } = monthDay(clock);
  const left = formatMoney({ ...budget, cents: budget.cents - month.paid.cents }, true);
  const pace = paceLine(month, day, daysInMonth, clock, phone);
  const room = `${teamWords.left(left)} · ${teamWords.daysToGo(daysInMonth - day)}`;
  if (pace.passes) {
    return (
      <Tile title={teamWords.thisMonth} headline={headline}>
        {meter}
        <SmallLine>{room}</SmallLine>
        <ToneLine tone="attention">{pace.words}</ToneLine>
      </Tile>
    );
  }
  return (
    <Tile title={teamWords.thisMonth} headline={headline}>
      {meter}
      {/* A phone keeps a pace under the budget on the same line as the room left (S24). */}
      {phone ? (
        <SmallLine>{`${room} · ${pace.words}`}</SmallLine>
      ) : (
        <>
          <SmallLine>{room}</SmallLine>
          <SmallLine>{pace.words}</SmallLine>
        </>
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
  phone: boolean,
): { words: string; passes: boolean } {
  const perDay = month.paid.cents / day;
  const projected = perDay * daysInMonth;
  const budget = month.budget?.cents ?? Number.POSITIVE_INFINITY;
  if (projected <= budget) {
    const total = formatMoney({ ...month.paid, cents: projected }, true);
    const words = phone ? teamWords.phone.atThisPace(total) : teamWords.atThisPace(total);
    return { words, passes: false };
  }
  const daysToBudget = Math.ceil((budget - month.paid.cents) / perDay);
  const passes = new Date(clock.now().getTime() + daysToBudget * dayMs);
  return { words: teamWords.passesBudget(formatDate(passes, clock)), passes: true };
}
