// A run at a customer's plan limit, in the words of flow C3 (HAL-12484, revision 7, with Sofia's
// changes on HAL-13563) as board 10 draws them (HAL-13521, round 5). They come from the stop's
// code and detail (`app.run-plan-stop`), so every product gets the same words. In S3 no plan is
// bigger (`canUpgrade` is false, S3-3), so nothing offers an upgrade: S4-16 adds it. Until Halonic
// Cloud sends the seller's name and support contact, line 2 leaves out the contact sentence.

import type { PlanRun, PlanStop, PlanUnitStop } from "@halonicjs/app/run-failure";
import { unitName } from "@halonicjs/studio-feature-account-menu/api";

/** The words for a run at a plan limit, in one place. */
export const planLimitWords = {
  /** The chip of a run that waits at a plan limit. */
  waitingChip: "Waiting: plan limit reached",
  /** The chip of a run turned away before it started: too many at once, or no plan. */
  notStartedChip: "Not started",
  /** The chip of a run that failed at a plan limit. */
  failedChip: "Failed",
  continueRun: "Continue the run",
  continuing: "Continuing the run…",
  seeUsage: "See usage",
  /** After **Continue the run**, as the wait card says it after an answer. Words for 1–6 not in C3: Sofia, HAL-19057. */
  continues: "The run continues.",
  finished: "The run finished.",
  /** After **Continue the run** when the run ended another way, such as an account no longer active. */
  ended: "The run ended without finishing.",
  usedUp: (unit: string) => `This run stopped: you've used this month's ${unit}`,
  reserveTitle: (unit: string) => `This step can't start: not enough ${unit} left this month`,
  /** Under 1% left reads "less than 1%", as "0% left" reads like a limit used up (Sofia, HAL-19057). */
  reserveLine: (unit: string, neededPercent: number, leftPercent: number) =>
    `It needs up to ${neededPercent}% of your monthly ${unit} and you have ${leftPercent === 0 ? "less than 1%" : `${leftPercent}%`} left.`,
  resets: (date: string) => `It resets on ${date}.`,
  /** After **Continue the run** when the run still waits at its limit (Noah, HAL-19110; words: Sofia). */
  stillNoRoom: "There's still no room for this run.",
  stoppedForGood: "This run stopped for good",
  waitedTooLong: "It waited 7 days at your plan's limit. Its results so far are kept.",
  tooMany: (running: number) =>
    `You have ${running} ${running === 1 ? "run" : "runs"} going, the most your plan allows at once`,
  startWhenOneFinishes: "Start this one when one of them finishes.",
  noPlan: "You don't have a plan right now",
  /** S3 has no Choose a plan, so the line says what's missing; S4-16 brings "Choose a plan…" back. */
  needPlan: "You need a plan to start runs.",
} as const;

/** A run's message at a plan limit: its chip, its title and the line under it ("" for none). */
export interface PlanLimitMessage {
  readonly chip: string;
  readonly title: string;
  readonly line: string;
}

/**
 * The message for a run at a plan limit, by where it stands (`inbox.plan-limit-card`):
 * waiting at a unit's limit or before a step, stopped for good after 7 days, or turned away
 * because too many run at once or there's no plan. A member's share reads like the customer's own
 * limit. `undefined` for a stop C3 doesn't word, such as a paused account (B6).
 *
 * @example
 * planLimitMessage(planRunOf(summary)).title; // "This run stopped: you've used this month's usage"
 */
export function planLimitMessage(run: PlanRun): PlanLimitMessage | undefined {
  if (run.state === "waiting") {
    return { chip: planLimitWords.waitingChip, ...unitMessage(run.stop) };
  }
  if (run.state === "stopped-for-good") {
    return {
      chip: planLimitWords.failedChip,
      title: planLimitWords.stoppedForGood,
      line: planLimitWords.waitedTooLong,
    };
  }
  return stoppedMessage(run.stop);
}

/** A unit's stop: its limit used up, or not enough left for the next step. */
export function unitMessage(stop: PlanUnitStop): Pick<PlanLimitMessage, "title" | "line"> {
  // A unit this Studio doesn't know yet reads as the general word, never as its code.
  const unit = unitName(stop.unit) ?? "usage";
  const day = stop.resetsAt === undefined ? undefined : dayOf(stop.resetsAt);
  const resets = day === undefined ? [] : [planLimitWords.resets(day)];
  if (stop.reserve === undefined) {
    return { title: planLimitWords.usedUp(unit), line: resets.join(" ") };
  }
  const { neededPercent, leftPercent } = stop.reserve;
  return {
    title: planLimitWords.reserveTitle(unit),
    line: [planLimitWords.reserveLine(unit, neededPercent, leftPercent), ...resets].join(" "),
  };
}

/**
 * The line after **Continue the run** when the run still waits at a unit's limit, with the day the
 * limit resets when the stop says it.
 *
 * @example
 * stillNoRoomLine(stop); // "There's still no room for this run. It resets on 2 December."
 */
export function stillNoRoomLine(stop: PlanStop): string {
  const day =
    stop.kind === "unit" && stop.resetsAt !== undefined ? dayOf(stop.resetsAt) : undefined;
  return [
    planLimitWords.stillNoRoom,
    ...(day === undefined ? [] : [planLimitWords.resets(day)]),
  ].join(" ");
}

/** A run that failed at a stop without waiting. */
function stoppedMessage(stop: PlanStop): PlanLimitMessage | undefined {
  switch (stop.kind) {
    case "unit":
      return { chip: planLimitWords.failedChip, ...unitMessage(stop) };
    case "concurrency":
      return {
        chip: planLimitWords.notStartedChip,
        title: planLimitWords.tooMany(stop.running),
        line: planLimitWords.startWhenOneFinishes,
      };
    case "none":
      return {
        chip: planLimitWords.notStartedChip,
        title: planLimitWords.noPlan,
        line: planLimitWords.needPlan,
      };
    default:
      return undefined;
  }
}

/** "2 December": the day a limit resets, in UTC, as the period ends there; `undefined` when unreadable. */
function dayOf(iso: string): string | undefined {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return undefined;
  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
