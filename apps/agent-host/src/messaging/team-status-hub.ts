import {
  MessagingCacheFolder,
  type TeamStatusRoute,
} from "@halonicjs/adapter-agent-messaging-cache";
import type { MessagingFailure } from "@halonicjs/host-agent-messaging-hub";
import { joinChanges } from "@halonicjs/host-agent-messaging-hub";
import type {
  AgentSpend,
  Clock,
  MergeQueue,
  MessagingId,
  PullRequestDetail,
  PullRequestList,
  Seat,
  SpendRange,
  SpendSummary,
  TeamRuns,
  TeamRunsQuery,
  TeamStatus,
  TeamStatusParts,
} from "@halonicjs/ports";
import {
  keptMergeQueue,
  keptParts,
  keptPullRequestList,
  keptSeat,
  keptSpend,
} from "./kept-team-status.ts";
import { type TeamAnswer, TeamRunsMemory } from "./team-runs-memory.ts";

/** How old an answer may be before a read fetches it again. */
export const teamStatusMaxAgeMs = 5 * 60_000;
/** The shortest gap between two fetches of one read from one provider, even when the last one failed. */
export const teamStatusFetchGapMs = 60_000;
/** The scheduler key and timer ID of the team status tick, which calls {@link TeamStatusHub.refresh}. */
export const teamStatusTickTimer = { key: "team-status", timerId: "tick" } as const;

/** A provider and the name its failures and its cache are kept under, such as `paperclip:acme`. Never shown to apps. */
export interface NamedTeamStatusProvider {
  name: string;
  status: TeamStatus;
}

/** What a {@link TeamStatusHub} joins, its time, its cache and where it reports a provider's failure. */
export interface TeamStatusHubOptions {
  providers: readonly NamedTeamStatusProvider[];
  clock: Clock;
  /** The cache folder, in the app data folder; the messaging cache's folder does. */
  folder: string;
  /** Every workspace folder the host serves; the cache folder must be outside each. */
  workspaceRoots: readonly string[];
  /** Says which cache file was broken and read as missing. */
  warn: (message: string) => void;
  /** Hears every provider failure the hub carries on past; the host logs it. */
  report: (failure: MessagingFailure) => void;
}

/** What the hub knows of one read from one provider. Times are in milliseconds. */
interface RouteState<Item> {
  answer?: TeamAnswer<Item>;
  /** When the provider last answered this read. */
  fetchedAt?: number;
  /** When the hub last asked, answered or not. */
  triedAt?: number;
  /** The fetch under way, which every read meanwhile waits for. */
  fetching?: Promise<TeamAnswer<Item>>;
}

/**
 * The item marked `fromCache`, so the Studio's Offline banner shows, when it
 * carries an "as of" time; the parts of a source carry none and stay as they are.
 */
function servedFromCache<Item extends object>(item: Item): Item {
  return "asOf" in item ? { ...item, fromCache: true } : item;
}

/**
 * The engine's one {@link TeamStatus}: it joins every provider's sources
 * (requirement `agent-host.team-status-hub`, architecture note section 1.5).
 * Spend, seats, pull requests and the queue are read on the 5-minute tick
 * and when a screen opens: a read whose answer is older than 5 minutes
 * fetches it again, at most once a minute per read and provider, and every
 * read meanwhile shares the one fetch. Runs are read on request only and
 * kept in memory, never on disk, at most once every 10 seconds per query and
 * provider (`agent-host.team-activity-routes`). Each other answer's port fields are kept in
 * the app data cache, under the same rules as the messaging cache. A
 * provider that fails is reported, and its last answer stands in, with the
 * source's own `asOf`; only when no provider has an answer does the read
 * fail. Per-agent spend and a pull request's detail are fetched on request.
 *
 * @example
 * const hub = new TeamStatusHub({ providers, clock, folder, workspaceRoots, warn, report });
 * const every = { windowOpenMs: teamStatusMaxAgeMs, windowClosedMs: teamStatusMaxAgeMs };
 * const tick = new SyncScheduler({ scheduler, clock, poll: () => hub.refresh(), timer: teamStatusTickTimer,
 *   rates: { ...pollRates, connected: every, down: every } });
 */
export class TeamStatusHub implements TeamStatus {
  readonly #providers: readonly NamedTeamStatusProvider[];
  readonly #clock: Clock;
  readonly #cache: MessagingCacheFolder;
  readonly #report: (failure: MessagingFailure) => void;
  /** One map per provider, by read. */
  readonly #routes: Map<TeamStatusRoute, RouteState<unknown>>[];
  readonly #spendRanges = new Set<SpendRange>(["today"]);
  readonly #runs: TeamRunsMemory;

  constructor(options: TeamStatusHubOptions) {
    this.#providers = options.providers;
    this.#clock = options.clock;
    this.#cache = new MessagingCacheFolder(options.folder, options.workspaceRoots, options.warn);
    this.#report = options.report;
    this.#routes = options.providers.map(() => new Map());
    this.#runs = new TeamRunsMemory(options.clock, options.providers.length);
  }

  parts(): Promise<readonly TeamStatusParts[]> {
    return this.#read("parts", (status) => status.parts(), keptParts);
  }

  spend(range: SpendRange): Promise<readonly SpendSummary[]> {
    this.#spendRanges.add(range);
    return this.#read(`spend-${range}`, (status) => status.spend(range), keptSpend);
  }

  seats(): Promise<readonly Seat[]> {
    return this.#read("seats", (status) => status.seats(), keptSeat);
  }

  pullRequests(): Promise<readonly PullRequestList[]> {
    return this.#read("pull-requests", (status) => status.pullRequests(), keptPullRequestList);
  }

  mergeQueue(): Promise<readonly MergeQueue[]> {
    return this.#read("merge-queue", (status) => status.mergeQueue(), keptMergeQueue);
  }

  /** Fetched on request only, and not cached: the screen that asks for it is open. */
  async agentSpend(range: SpendRange): Promise<readonly AgentSpend[]> {
    const answers = await Promise.all(
      this.#providers.map((_, index) =>
        this.#fetchOnce(index, "agentSpend", (status) => status.agentSpend(range)),
      ),
    );
    return this.#joined("agentSpend", answers);
  }

  /** The detail from the provider that knows the pull request; fetched on request only. */
  async pullRequest(id: MessagingId): Promise<PullRequestDetail | undefined> {
    const answers = await Promise.all(
      this.#providers.map((_, index) =>
        this.#fetchOnce(index, "pullRequest", async (status) => {
          const detail = await status.pullRequest(id);
          return detail === undefined ? [] : [detail];
        }),
      ),
    );
    return this.#joined("pullRequest", answers)[0];
  }

  /** Every provider's runs for `query`; a provider that serves none answers none. */
  async runs(query: TeamRunsQuery): Promise<readonly TeamRuns[]> {
    const answers = await Promise.all(
      this.#providers.map((_, index) =>
        this.#runs.answerOf(index, query, () =>
          this.#fetchOnce(index, "runs", (status) => status.runs?.(query) ?? Promise.resolve([])),
        ),
      ),
    );
    return this.#joined("runs", answers);
  }

  /** Deletes the answers kept for the provider named `name`, which Disconnect dropped. */
  async clear(name: string): Promise<void> {
    await this.#cache.clearTeamStatus(name);
  }

  changes(): AsyncIterable<MessagingId> {
    const streams = this.#providers.map((provider) => provider.status.changes());
    return joinChanges(streams, (index, error) => this.#failed(index, "changes", error));
  }

  /**
   * The tick: reads parts, seats, pull requests, the queue and every spend
   * range read so far, each under the usual age rule. Each provider's failure
   * is already reported by the read, so a read that fails as a whole adds
   * nothing to say and the tick never rejects.
   */
  async refresh(): Promise<void> {
    const ranges = [...this.#spendRanges];
    await Promise.allSettled([
      this.parts(),
      this.seats(),
      this.pullRequests(),
      this.mergeQueue(),
      ...ranges.map((range) => this.spend(range)),
    ]);
  }

  async #read<Item extends { source: MessagingId }>(
    route: TeamStatusRoute,
    read: (status: TeamStatus) => Promise<readonly Item[]>,
    keep: (item: Item) => Item,
  ): Promise<Item[]> {
    const answers = await Promise.all(
      this.#providers.map((_, index) => this.#answerOf(index, route, read, keep)),
    );
    return this.#joined(route, answers);
  }

  /** The provider's answer to one read: kept while fresh or just tried, fetched otherwise. */
  #answerOf<Item extends { source: MessagingId }>(
    index: number,
    route: TeamStatusRoute,
    read: (status: TeamStatus) => Promise<readonly Item[]>,
    keep: (item: Item) => Item,
  ): Promise<TeamAnswer<Item>> {
    const routes = this.#routes[index] ?? new Map();
    // Every read of a route stores the same item type, so the map's entry is this read's.
    const state = (routes.get(route) ?? {}) as RouteState<Item>;
    routes.set(route, state);
    if (state.fetching !== undefined) return state.fetching;
    const now = this.#clock.now().getTime();
    const fresh = state.fetchedAt !== undefined && now - state.fetchedAt < teamStatusMaxAgeMs;
    const justTried = state.triedAt !== undefined && now - state.triedAt < teamStatusFetchGapMs;
    if (state.answer !== undefined && (fresh || justTried)) return Promise.resolve(state.answer);
    state.triedAt = now;
    state.fetching = this.#fetch(index, route, state, read, keep).finally(() => {
      delete state.fetching;
    });
    return state.fetching;
  }

  async #fetch<Item extends { source: MessagingId }>(
    index: number,
    route: TeamStatusRoute,
    state: RouteState<Item>,
    read: (status: TeamStatus) => Promise<readonly Item[]>,
    keep: (item: Item) => Item,
  ): Promise<TeamAnswer<Item>> {
    const name = this.#providers[index]?.name ?? "unknown";
    const fetched = await this.#fetchOnce(index, route, read);
    if (fetched.ok) {
      const items = fetched.items.map(keep);
      state.answer = { ok: true, items };
      if (state.triedAt !== undefined) state.fetchedAt = state.triedAt;
      const asOf = this.#clock.now().toISOString();
      await this.#cache.saveTeamStatus(name, route, { asOf, items }).catch((error: unknown) => {
        this.#failed(index, `cache ${route}`, error);
      });
      return state.answer;
    }
    // Offline: the last answer stands, from memory or, after a restart, from the cache.
    if (state.answer?.ok === true) {
      state.answer = { ok: true, items: state.answer.items.map(servedFromCache) };
      return state.answer;
    }
    const cached = await this.#cache.loadTeamStatus<Item>(name, route);
    state.answer =
      cached === undefined ? fetched : { ok: true, items: cached.items.map(servedFromCache) };
    return state.answer;
  }

  /** One call to the provider; a failure is reported and given back as the answer. */
  async #fetchOnce<Item>(
    index: number,
    action: string,
    read: (status: TeamStatus) => Promise<readonly Item[]>,
  ): Promise<TeamAnswer<Item>> {
    const provider = this.#providers[index];
    if (provider === undefined) return { ok: true, items: [] };
    try {
      return { ok: true, items: await read(provider.status) };
    } catch (error) {
      this.#failed(index, action, error);
      return { ok: false, error };
    }
  }

  /** The providers' items one after the other; throws when every provider failed with nothing to show. */
  #joined<Item>(action: string, answers: readonly TeamAnswer<Item>[]): Item[] {
    const errors = answers.flatMap((answer) => (answer.ok ? [] : [answer.error]));
    if (errors.length > 0 && errors.length === answers.length) {
      throw new AggregateError(errors, `Every team status provider failed ${action}.`);
    }
    return answers.flatMap((answer) => (answer.ok ? answer.items : []));
  }

  #failed(index: number, action: string, error: unknown): void {
    this.#report({ provider: this.#providers[index]?.name ?? "unknown", action, error });
  }
}
