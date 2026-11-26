/**
 * How a change reached the engine's local copy: a live event, a poll, the catch-up read after a
 * start or a (re)connect, or a write the source accepted.
 */
export type SyncSource = "event" | "poll" | "catch-up" | "write";

/** Every {@link SyncSource}, in the order diagnostics list them. */
export const syncSources: readonly SyncSource[] = ["event", "poll", "catch-up", "write"];

/**
 * Whether the source's live events reach the engine: `connected`, `polling-only` while they are
 * down, or `not-allowed` while the source refuses them.
 */
export type SyncConnection = "connected" | "polling-only" | "not-allowed";

/** Every {@link SyncConnection}, in the order diagnostics list them. */
export const syncConnections: readonly SyncConnection[] = [
  "connected",
  "polling-only",
  "not-allowed",
];

/** How long something took, over the samples counted: `null` percentiles while there are none. */
export interface SyncTiming {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

/** One provider route's calls: its template only, such as `issues/:task`, never an ID or a query. */
export interface SyncRouteTiming extends SyncTiming {
  method: string;
  route: string;
  /** Calls that got no answer or an answer of 400 or more. */
  failed: number;
  /** The answers' bodies, in bytes, all calls together. */
  bytes: number;
}

/**
 * What `GET /v1/sync/diagnostics` answers (requirement `agent-host.sync-diagnostics`): counts and
 * timings over the last `windowMs`, all sources together. It holds no title, body, ID or query.
 */
export interface SyncDiagnostics {
  /** The window counted, in milliseconds: 24 hours, or since the engine started when that is later. */
  windowMs: number;
  /** Changes applied to the local copy, by how they arrived, with each one's share from 0 to 1. */
  updates: Record<SyncSource, { count: number; share: number }>;
  /** From the record's change at the source to its event arriving. */
  eventLag: SyncTiming;
  /** From the newest change a poll found, at the source, to the poll applying it. */
  pollLag: SyncTiming;
  /** Changes a poll found while events were connected but no event had announced. */
  missedByEvents: number;
  /** How often events connected again after the first time. */
  reconnects: number;
  /** Whether live events reach the engine now. */
  connection: SyncConnection;
  /** Milliseconds spent in each {@link SyncConnection} within the window. */
  timeIn: Record<SyncConnection, number>;
  /** Each provider route the engine called, by how often and how long. */
  routes: SyncRouteTiming[];
}
