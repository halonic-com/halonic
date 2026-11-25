/**
 * Merge control's GitHub call budget (HAL-17913). On 24 Nov the Merger's
 * account hit GitHub's 5,000 calls an hour and its passes stopped for
 * 45 minutes. Reads go out on the read-only App token (`githubToken`) and
 * writes on the queue credential, each with its own GitHub limit, so each
 * is counted against its own hourly budget. When either runs low the pass
 * degrades (it skips reads only shadow mode needs and waits longer before
 * the next pass) instead of stopping.
 */

/** The two identities a pass calls GitHub as. */
export type Identity = "read" | "write";

/** What one pass saw for one identity. */
export interface PassCalls {
  /** Requests GitHub received; cache hits and 304 answers aren't counted. */
  readonly calls: number;
  /** The lowest remaining GitHub named in a header or `rateLimit`, or null. */
  readonly remaining: number | null;
  /** When that limit resets, ISO, or null. */
  readonly resetAt: string | null;
}

/** One identity's use in the current UTC hour, kept between passes. */
export interface IdentityUsage {
  /** The UTC hour it counts, `2026-11-25T03`. */
  readonly hour: string;
  readonly calls: number;
  readonly githubRemaining: number | null;
  readonly resetAt: string | null;
}

/** What the pass keeps of the budget in its stored state. */
export interface StoredBudget {
  readonly read: IdentityUsage;
  readonly write: IdentityUsage;
  /** Degraded passes wait until then; null: the next pass runs. */
  readonly skipUntil: string | null;
}

/** One identity's hourly budget and the remaining count below which the pass degrades. */
export interface IdentityBudget {
  readonly perHour: number;
  readonly lowAt: number;
}

/** The budget's settings, from the board's plugin settings. */
export interface BudgetSettings {
  readonly read: IdentityBudget;
  readonly write: IdentityBudget;
  /** Minutes a degraded pass waits before the next one. */
  readonly degradedIntervalMinutes: number;
}

/**
 * Defaults well under GitHub's limits: the App's 15,000 an hour for reads,
 * the queue credential's 5,000 for writes.
 */
export const defaultBudget: BudgetSettings = {
  read: { perHour: 12_000, lowAt: 1_000 },
  write: { perHour: 3_500, lowAt: 350 },
  degradedIntervalMinutes: 5,
};

/** No calls yet. */
export const noCalls: PassCalls = { calls: 0, remaining: null, resetAt: null };

function hourOf(now: Date): string {
  return now.toISOString().slice(0, 13);
}

/** Adds a pass's calls to the hour's, starting a new count in a new UTC hour. */
export function addCalls(
  usage: IdentityUsage | undefined,
  pass: PassCalls,
  now: Date,
): IdentityUsage {
  const hour = hourOf(now);
  const before = usage?.hour === hour ? usage : undefined;
  return {
    hour,
    calls: (before?.calls ?? 0) + pass.calls,
    githubRemaining: pass.remaining ?? before?.githubRemaining ?? null,
    resetAt: pass.resetAt ?? before?.resetAt ?? null,
  };
}

/** What is left: the budget less this hour's calls, or less if GitHub says so. */
export function remainingOf(usage: IdentityUsage, budget: IdentityBudget): number {
  const own = Math.max(0, budget.perHour - usage.calls);
  return usage.githubRemaining === null ? own : Math.min(own, usage.githubRemaining);
}

/** When the budget resets: GitHub's reset when it named one, else the next UTC hour. */
export function resetOf(usage: IdentityUsage): string {
  if (usage.resetAt !== null) {
    return usage.resetAt;
  }
  return new Date(Date.parse(`${usage.hour}:00:00Z`) + 60 * 60_000).toISOString();
}

/** Whether the identity's remaining budget is under its threshold. */
export function isLow(
  usage: IdentityUsage | undefined,
  budget: IdentityBudget,
  now: Date,
): boolean {
  if (usage === undefined || usage.hour !== hourOf(now)) {
    return false;
  }
  return remainingOf(usage, budget) < budget.lowAt;
}

/** The result of a pass's budget: what it keeps, whether it degraded, and its summary. */
export interface PassBudget {
  readonly stored: StoredBudget;
  readonly degraded: boolean;
  readonly summary: string;
}

function identityText(
  name: string,
  pass: PassCalls,
  usage: IdentityUsage,
  budget: IdentityBudget,
): string {
  const reset = resetOf(usage).slice(11, 16);
  return `${name} ${pass.calls} this pass, ${remainingOf(usage, budget)} of ${budget.perHour}/h left, resets ${reset} UTC`;
}

/**
 * Adds a pass's reads and writes to the stored budget. Either identity
 * under its threshold degrades the pass; a degraded pass, or one that
 * `forced` (a refused token, GitHub's own limit), delays the next pass.
 */
export function passBudget(
  before: StoredBudget | undefined,
  calls: { readonly read: PassCalls; readonly write: PassCalls },
  settings: BudgetSettings,
  now: Date,
  forced?: string,
): PassBudget {
  const read = addCalls(before?.read, calls.read, now);
  const write = addCalls(before?.write, calls.write, now);
  const low = [
    ...(isLow(read, settings.read, now) ? ["reads"] : []),
    ...(isLow(write, settings.write, now) ? ["writes"] : []),
  ];
  const why = forced ?? (low.length > 0 ? `${low.join(" and ")} low` : undefined);
  const skipUntil =
    why === undefined
      ? null
      : new Date(now.getTime() + settings.degradedIntervalMinutes * 60_000).toISOString();
  const texts = [
    identityText("reads", calls.read, read, settings.read),
    identityText("writes", calls.write, write, settings.write),
  ];
  const degraded =
    why === undefined ? "" : `; degraded (${why}), next pass after ${skipUntil?.slice(11, 16)} UTC`;
  return {
    stored: { read, write, skipUntil },
    degraded: why !== undefined,
    summary: `GitHub budget: ${texts.join("; ")}${degraded}`,
  };
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Reads the budget from merge control's settings; a missing or odd value keeps the default. */
export function readBudgetSettings(section: Readonly<Record<string, unknown>>): BudgetSettings {
  return {
    read: {
      perHour: positive(section["readBudgetPerHour"], defaultBudget.read.perHour),
      lowAt: positive(section["readLowAt"], defaultBudget.read.lowAt),
    },
    write: {
      perHour: positive(section["writeBudgetPerHour"], defaultBudget.write.perHour),
      lowAt: positive(section["writeLowAt"], defaultBudget.write.lowAt),
    },
    degradedIntervalMinutes: positive(
      section["degradedIntervalMinutes"],
      defaultBudget.degradedIntervalMinutes,
    ),
  };
}
