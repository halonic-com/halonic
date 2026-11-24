import type { RestRun } from "./facts-runs.ts";
import type { RunnerCapacity } from "./snapshot.ts";

/**
 * Runner capacity (ADR on HAL-17700, board 24 Nov 17:47): free merge-queue
 * slots from the CI server's status file, jobs waiting per runner label
 * from the CI live metrics (`halonic_ci_live_jobs_waiting` in Prometheus),
 * and merge groups cancelled in the last hour from GitHub's run list. Both
 * addresses come from the settings. A source that is unset, unreachable,
 * odd or stale makes the whole capacity null, which counts as short: a
 * jump never goes on half a picture.
 */

/** A source older than this is stale. Both are written every minute. */
export const capacityStaleMinutes = 5;

/** GETs one address with no credentials and returns its JSON. */
export type PlainGet = (url: string) => Promise<unknown>;

/** Where capacity is read from; an empty address is unset. */
export interface CapacitySources {
  /** The status file `ci-status.json`, served over HTTP. */
  readonly statusUrl: string;
  /** Prometheus' address, scheme, host and port only. */
  readonly prometheusUrl: string;
  /** The runner label merge groups run on, such as `large`. */
  readonly queueLabel: string;
}

/** The capacity, or null with why. */
export type CapacityRead =
  | { readonly capacity: RunnerCapacity; readonly why?: undefined }
  | { readonly capacity: null; readonly why: string };

interface StatusFile {
  readonly ok?: boolean;
  readonly generated_at?: number;
  readonly slots?: readonly {
    readonly label?: string;
    readonly unit?: string;
    readonly busy?: boolean;
    readonly runner?: string | null;
  }[];
}

function fresh(seconds: unknown, now: Date): boolean {
  return typeof seconds === "number" && now.getTime() / 1000 - seconds <= capacityStaleMinutes * 60;
}

/** Free slots of the queue's pool: up, idle and with a runner registered. */
export function freeSlotsOf(status: StatusFile, label: string, now: Date): number | string {
  if (status.ok !== true || !Array.isArray(status.slots)) {
    return "the status file says the CI server didn't answer";
  }
  if (!fresh(status.generated_at, now)) {
    return "the status file is stale";
  }
  return status.slots.filter(
    (slot) =>
      slot.label === `halonic-ci-${label}` &&
      slot.unit === "active" &&
      slot.busy !== true &&
      typeof slot.runner === "string" &&
      slot.runner !== "",
  ).length;
}

interface PromVector {
  readonly status?: string;
  readonly data?: {
    readonly result?: readonly {
      readonly metric?: Readonly<Record<string, string>>;
      readonly value?: readonly [number, string];
    }[];
  };
}

/** The query: jobs waiting per runner label, and when the collector last wrote. */
export const capacityQuery = `{__name__=~"halonic_ci_live_jobs_waiting|halonic_ci_live_updated"}`;

/**
 * Jobs waiting per runner label, named like the pools (`halonic-ci-large`
 * is `large`); a label with none waiting isn't listed.
 */
export function waitingOf(answer: PromVector, now: Date): Record<string, number> | string {
  const result = answer.status === "success" ? answer.data?.result : undefined;
  if (!Array.isArray(result)) {
    return "Prometheus gave no answer";
  }
  const updated = result.find((row) => row.metric?.["__name__"] === "halonic_ci_live_updated");
  if (!fresh(Number(updated?.value?.[1]), now)) {
    return "the CI live metrics are stale";
  }
  const waiting: Record<string, number> = {};
  for (const row of result) {
    const count = Number(row.value?.[1]);
    const runner = row.metric?.["runner"];
    if (row.metric?.["__name__"] === "halonic_ci_live_jobs_waiting" && runner && count > 0) {
      const label = runner.replace(/^halonic-ci-/, "");
      waiting[label] = (waiting[label] ?? 0) + count;
    }
  }
  return waiting;
}

/** Merge-group `CI` runs cancelled in the last hour. */
export function cancelledLastHour(runs: readonly RestRun[], now: Date): number {
  const since = now.getTime() - 60 * 60_000;
  return runs.filter(
    (run) =>
      run.name === "CI" && run.conclusion === "cancelled" && Date.parse(run.updated_at) >= since,
  ).length;
}

async function attempt<T>(read: () => Promise<T>, source: string): Promise<T | string> {
  try {
    return await read();
  } catch (error) {
    return `${source} can't be read (${(error as Error).message})`;
  }
}

/** Reads both sources; anything missing makes the capacity null. */
export async function readCapacity(
  get: PlainGet,
  sources: CapacitySources,
  groupRuns: readonly RestRun[],
  now: Date,
): Promise<CapacityRead> {
  if (sources.statusUrl === "" || sources.prometheusUrl === "") {
    return { capacity: null, why: "capacity sources aren't set" };
  }
  const free = await attempt(
    async () => freeSlotsOf((await get(sources.statusUrl)) as StatusFile, sources.queueLabel, now),
    "the status file",
  );
  const query = new URLSearchParams({ query: capacityQuery });
  const waiting = await attempt(
    async () =>
      waitingOf((await get(`${sources.prometheusUrl}/api/v1/query?${query}`)) as PromVector, now),
    "Prometheus",
  );
  if (typeof free === "string" || typeof waiting === "string") {
    return {
      capacity: null,
      why: [free, waiting].filter((why) => typeof why === "string").join("; "),
    };
  }
  return {
    capacity: {
      freeQueueSlots: free,
      waitingByLabel: waiting,
      cancelledGroupsLastHour: cancelledLastHour(groupRuns, now),
    },
  };
}
