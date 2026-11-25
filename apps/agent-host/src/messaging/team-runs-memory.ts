import type { Clock, TeamRuns, TeamRunsQuery } from "@halonicjs/ports";

/** The shortest gap between two fetches of one runs query from one provider, even when the last one failed. */
export const teamRunsFetchGapMs = 10_000;

/** How many runs queries one provider's memory keeps; the oldest is forgotten first. */
export const teamRunsQueriesKept = 16;

/** One provider's answer to one read: its items, or the error when it has none to give. */
export type TeamAnswer<Item> = { ok: true; items: readonly Item[] } | { ok: false; error: unknown };

/** What the memory knows of one runs query from one provider. Times are in milliseconds. */
interface KeptRuns {
  answer?: TeamAnswer<TeamRuns>;
  /** When the memory last asked, answered or not. */
  triedAt?: number;
  /** The fetch under way, which every read of the query meanwhile waits for. */
  fetching?: Promise<TeamAnswer<TeamRuns>>;
}

/**
 * The team hub's runs answers (requirement `agent-host.team-activity-routes`),
 * kept in memory only: runs are fresh by nature and carry task titles, so
 * nothing of them is written to disk. One query is fetched at most once every
 * 10 seconds per provider, and every read meanwhile shares the one fetch.
 * While a provider fails, its last answer stands in, marked `fromCache`.
 */
export class TeamRunsMemory {
  readonly #clock: Clock;
  /** One map per provider, by query. */
  readonly #kept: Map<string, KeptRuns>[];

  constructor(clock: Clock, providers: number) {
    this.#clock = clock;
    this.#kept = Array.from({ length: providers }, () => new Map());
  }

  /** The provider's answer to `query`: kept while just tried, fetched with `fetch` otherwise. */
  answerOf(
    index: number,
    query: TeamRunsQuery,
    fetch: () => Promise<TeamAnswer<TeamRuns>>,
  ): Promise<TeamAnswer<TeamRuns>> {
    const kept = this.#keptFor(index, keyOf(query));
    if (kept.fetching !== undefined) return kept.fetching;
    const now = this.#clock.now().getTime();
    const justTried = kept.triedAt !== undefined && now - kept.triedAt < teamRunsFetchGapMs;
    if (kept.answer !== undefined && justTried) return Promise.resolve(kept.answer);
    kept.triedAt = now;
    kept.fetching = this.#fetch(kept, fetch).finally(() => {
      delete kept.fetching;
    });
    return kept.fetching;
  }

  async #fetch(
    kept: KeptRuns,
    fetch: () => Promise<TeamAnswer<TeamRuns>>,
  ): Promise<TeamAnswer<TeamRuns>> {
    const fetched = await fetch();
    if (!fetched.ok && kept.answer?.ok === true) {
      const items = kept.answer.items.map((runs) => ({ ...runs, fromCache: true }));
      kept.answer = { ok: true, items };
      return kept.answer;
    }
    kept.answer = fetched;
    return fetched;
  }

  /** The query's entry, made when new; a provider's memory never holds more than {@link teamRunsQueriesKept}. */
  #keptFor(index: number, key: string): KeptRuns {
    const queries = this.#kept[index] ?? new Map<string, KeptRuns>();
    const known = queries.get(key);
    if (known !== undefined) return known;
    const oldest = queries.keys().next();
    if (queries.size >= teamRunsQueriesKept && oldest.done !== true) queries.delete(oldest.value);
    const made: KeptRuns = {};
    queries.set(key, made);
    return made;
  }
}

function keyOf(query: TeamRunsQuery): string {
  return JSON.stringify([query.agent ?? null, query.since ?? null]);
}
