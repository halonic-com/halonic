import type { UsageWarning } from "./api.ts";

/** The part of the page's `localStorage` the memory uses. */
export type BannerStorage = Pick<Storage, "getItem" | "setItem">;

/** The prefix of each closed banner's key; the rest is `unit:resetsAt`. */
const keyPrefix = "halonic.account-menu.usage-banner-closed.";

/** From this percent a unit gets its banner, as the computer's `warnings` do. */
const warningPercent = 80;

/**
 * Which usage banners were closed on this device: one key per unit and period, `unit:resetsAt`,
 * so a closed banner stays closed until the unit's next period, and another unit still shows.
 * Without storage it remembers nothing past this page.
 */
export class UsageBannerMemory {
  readonly #storage: BannerStorage | null;
  /** The banners closed on this page, for storage that refused to keep them. */
  readonly #closedHere = new Set<string>();

  constructor(storage: BannerStorage | null) {
    this.#storage = storage;
  }

  /** Whether the banner for this unit and period was closed. */
  isClosed(warning: UsageWarning): boolean {
    const key = closedKey(warning);
    if (this.#closedHere.has(key)) return true;
    return (this.#storage?.getItem(keyPrefix + key) ?? null) !== null;
  }

  /** Remembers the banner as closed. Storage that throws (full, or turned off) is logged. */
  close(warning: UsageWarning): void {
    const key = closedKey(warning);
    this.#closedHere.add(key);
    try {
      this.#storage?.setItem(keyPrefix + key, "closed");
    } catch (error) {
      console.error("Couldn't remember the closed usage banner.", error);
    }
  }
}

/**
 * The warning the banner shows: the highest unit at 80% or more and under 100% that has a name
 * and wasn't closed, or `undefined` for none.
 */
export function bannerWarning(
  warnings: readonly UsageWarning[],
  isClosed: (warning: UsageWarning) => boolean,
  isNamed: (unit: string) => boolean,
): UsageWarning | undefined {
  const shown = warnings.filter(
    (warning) =>
      warning.percent >= warningPercent &&
      warning.percent < 100 &&
      isNamed(warning.unit) &&
      !isClosed(warning),
  );
  return shown.sort((left, right) => right.percent - left.percent)[0];
}

function closedKey({ unit, resetsAt }: UsageWarning): string {
  return `${unit}:${resetsAt}`;
}
