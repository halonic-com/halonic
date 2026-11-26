import {
  type Clock,
  type SyncConnection,
  type SyncDiagnostics,
  type SyncRouteTiming,
  type SyncSource,
  type SyncTiming,
  syncConnections,
  syncSources,
} from "@halonicjs/ports";

/** How far back the counters look: 24 hours. */
export const syncDiagnosticsWindowMs = 24 * 60 * 60_000;

/** How often the counters write their summary line, besides on every change of connection. */
export const syncLogEveryMs = 15 * 60_000;

/** The most samples one kind of count keeps; the oldest go first, so memory stays bounded. */
const samplesMax = 20_000;

/**
 * The most changes of connection kept. A socket that opens and drops at once reconnects about
 * every 30 seconds at the 60-second cap (full jitter halves the mean), so about 5,760 changes in
 * 24 hours; this cap bounds that case, and any socket that stays open longer stays below it.
 */
export const connectionChangesMax = 5_000;

/**
 * One call to the provider, as its client times it: the route's template only, such as
 * `issues/:task`, never the address, an ID, the query, a header or the body.
 */
export interface SyncRouteCall {
  method: string;
  route: string;
  /** The HTTP status, or `offline` when no answer came. */
  status: number | "offline";
  ms: number;
  bytes: number;
}

interface UpdateSample {
  at: number;
  source: SyncSource;
  lagMs: number | undefined;
  missed: boolean;
}

interface CallSample {
  at: number;
  key: string;
  ms: number;
  bytes: number;
  failed: boolean;
}

/** What a {@link SyncCounters} needs: the time, and where its lines go. */
export interface SyncCountersOptions {
  clock: Clock;
  /** Hears one line per change of connection and one every {@link syncLogEveryMs}: counts and timings only. */
  log: (line: string) => void;
}

/**
 * The sync's counters (requirement `agent-host.sync-diagnostics`): every change applied to the
 * local copy and how it arrived, how late polls and events were, how often events reconnected,
 * how long the engine spent connected, polling only or not allowed, and how each provider route
 * answered, over the last 24 hours, in memory. They keep counts and timings only: never a title,
 * a body, an ID or a query.
 *
 * @example
 * const counters = new SyncCounters({ clock, log });
 * counters.applied("poll", batch.asOf);
 * counters.diagnostics().updates.poll.share; // 1
 */
export class SyncCounters {
  readonly #clock: Clock;
  readonly #log: (line: string) => void;
  readonly #startedAt: number;
  #updates: UpdateSample[] = [];
  #calls: CallSample[] = [];
  #reconnects: { at: number }[] = [];
  /** Each change of connection, oldest first; the one before the window stays, as its start. */
  #connections: { at: number; state: SyncConnection }[];
  #everConnected = false;
  #loggedAt: number;

  constructor(options: SyncCountersOptions) {
    this.#clock = options.clock;
    this.#log = options.log;
    this.#startedAt = this.#now();
    this.#loggedAt = this.#startedAt;
    this.#connections = [{ at: this.#startedAt, state: "polling-only" }];
  }

  /**
   * Counts one change applied to the local copy. For a poll or an event, `asOf` is the source's
   * time of the change, which gives its lag; a change in the future of this clock counts as 0.
   */
  applied(source: SyncSource, asOf?: string): void {
    const at = this.#now();
    const changedAt = asOf === undefined ? Number.NaN : Date.parse(asOf);
    const timed = (source === "poll" || source === "event") && !Number.isNaN(changedAt);
    const missed = source === "poll" && this.#connection() === "connected";
    this.#updates = kept(this.#updates, at, {
      at,
      source,
      lagMs: timed ? Math.max(0, at - changedAt) : undefined,
      missed,
    });
  }

  /** Counts one call to the provider. */
  called(call: SyncRouteCall): void {
    const at = this.#now();
    const failed = call.status === "offline" || call.status >= 400;
    const sample = {
      at,
      key: `${call.method} ${call.route}`,
      ms: call.ms,
      bytes: call.bytes,
      failed,
    };
    this.#calls = kept(this.#calls, at, sample);
  }

  /** Records whether live events reach the engine, and writes a line when that changed. */
  setConnection(state: SyncConnection): void {
    if (state === this.#connection()) return;
    const at = this.#now();
    if (state === "connected" && this.#everConnected) {
      this.#reconnects = kept(this.#reconnects, at, { at });
    }
    if (state === "connected") this.#everConnected = true;
    this.#connections.push({ at, state });
    this.#forgetConnectionsBefore(at - syncDiagnosticsWindowMs);
    this.#writeLine();
  }

  /** How many changes of connection are held in memory: those of the window and the one before it. */
  get connectionChangesHeld(): number {
    return this.#connections.length;
  }

  /** Writes the summary line when {@link syncLogEveryMs} passed since the last one; the host calls it after each poll. */
  tick(): void {
    if (this.#now() - this.#loggedAt >= syncLogEveryMs) this.#writeLine();
  }

  /** The counts and timings of the last 24 hours, as `GET /v1/sync/diagnostics` answers them. */
  diagnostics(): SyncDiagnostics {
    const now = this.#now();
    const from = now - syncDiagnosticsWindowMs;
    const updates = this.#updates.filter((sample) => sample.at > from);
    const countOf = (source: SyncSource) =>
      updates.filter((sample) => sample.source === source).length;
    const lagOf = (source: SyncSource) =>
      timing(
        updates.flatMap((sample) =>
          sample.source === source && sample.lagMs !== undefined ? [sample.lagMs] : [],
        ),
      );
    return {
      windowMs: Math.min(syncDiagnosticsWindowMs, now - this.#startedAt),
      updates: Object.fromEntries(
        syncSources.map((source) => {
          const count = countOf(source);
          return [source, { count, share: updates.length === 0 ? 0 : count / updates.length }];
        }),
      ) as SyncDiagnostics["updates"],
      eventLag: lagOf("event"),
      pollLag: lagOf("poll"),
      missedByEvents: updates.filter((sample) => sample.missed).length,
      reconnects: this.#reconnects.filter((sample) => sample.at > from).length,
      connection: this.#connection(),
      timeIn: this.#timeIn(from, now),
      routes: routeTimings(this.#calls.filter((sample) => sample.at > from)),
    };
  }

  #connection(): SyncConnection {
    return this.#connections.at(-1)?.state ?? "polling-only";
  }

  #timeIn(from: number, now: number): Record<SyncConnection, number> {
    const spent = Object.fromEntries(syncConnections.map((state) => [state, 0])) as Record<
      SyncConnection,
      number
    >;
    this.#connections.forEach((change, index) => {
      const end = this.#connections[index + 1]?.at ?? now;
      spent[change.state] += Math.max(0, end - Math.max(change.at, from));
    });
    this.#forgetConnectionsBefore(from);
    return spent;
  }

  /** Forgets changes of connection before `from`, and the oldest past {@link connectionChangesMax}. */
  #forgetConnectionsBefore(from: number): void {
    // Only the last change before the window still says how the window started.
    const before = this.#connections.findLastIndex((change) => change.at <= from);
    if (before > 0) this.#connections = this.#connections.slice(before);
    if (this.#connections.length > connectionChangesMax) {
      this.#connections = this.#connections.slice(-connectionChangesMax);
    }
  }

  #writeLine(): void {
    this.#loggedAt = this.#now();
    this.#log(`${summaryLine(this.diagnostics())}\n`);
  }

  #now(): number {
    return this.#clock.now().getTime();
  }
}

/**
 * One line of the counters, such as `Sync: polling-only; updates event 0 (0 %), poll 3 (75 %), …`:
 * counts and timings only.
 */
export function summaryLine(diagnostics: SyncDiagnostics): string {
  const updates = syncSources
    .map((source) => {
      const { count, share } = diagnostics.updates[source];
      return `${source} ${count} (${Math.round(share * 100)} %)`;
    })
    .join(", ");
  const calls = diagnostics.routes.reduce((sum, route) => sum + route.count, 0);
  return [
    `Sync: ${diagnostics.connection}`,
    `updates ${updates}`,
    `event lag ${timingText(diagnostics.eventLag)}`,
    `poll lag ${timingText(diagnostics.pollLag)}`,
    `missed by events ${diagnostics.missedByEvents}`,
    `reconnects ${diagnostics.reconnects}`,
    `${calls} calls`,
  ].join("; ");
}

function timingText(timed: SyncTiming): string {
  if (timed.p50Ms === null || timed.p95Ms === null) return "none";
  return `p50 ${Math.round(timed.p50Ms)} ms p95 ${Math.round(timed.p95Ms)} ms`;
}

/** `samples` with `sample` added, without those older than the window, and at most {@link samplesMax}. */
function kept<Sample extends { at: number }>(
  samples: Sample[],
  now: number,
  sample: Sample,
): Sample[] {
  const from = now - syncDiagnosticsWindowMs;
  const recent = samples.filter((each) => each.at > from);
  recent.push(sample);
  return recent.length > samplesMax ? recent.slice(recent.length - samplesMax) : recent;
}

/** The count and the 50th and 95th percentiles (nearest rank) of `values`. */
function timing(values: readonly number[]): SyncTiming {
  if (values.length === 0) return { count: 0, p50Ms: null, p95Ms: null };
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (share: number) => sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)] ?? 0;
  return { count: sorted.length, p50Ms: rank(0.5), p95Ms: rank(0.95) };
}

function routeTimings(calls: readonly CallSample[]): SyncRouteTiming[] {
  const byRoute = Map.groupBy(calls, (call) => call.key);
  return [...byRoute].map(([key, samples]) => {
    const [method = "", route = ""] = key.split(" ");
    return {
      method,
      route,
      ...timing(samples.map((sample) => sample.ms)),
      failed: samples.filter((sample) => sample.failed).length,
      bytes: samples.reduce((sum, sample) => sum + sample.bytes, 0),
    };
  });
}
