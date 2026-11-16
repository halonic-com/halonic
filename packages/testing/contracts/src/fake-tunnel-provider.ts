import {
  assertTunnelConfig,
  type Clock,
  type TunnelCapabilities,
  type TunnelConfig,
  type TunnelEndpoint,
  type TunnelProvider,
  type TunnelReason,
  type TunnelStatus,
} from "@halonicjs/ports";
import type { ControlledClock } from "./clock.ts";

/**
 * Simulated time for a {@link FakeTunnelProvider}: a clock that only moves
 * when a test calls `advance`, and `wait`, which the fake uses to spend its
 * latency. No timer ever runs, so a test never sleeps and never flakes.
 */
export class FakeTunnelTime implements ControlledClock {
  private nowMs: number;
  private sleepers: { wakesAt: number; wake: () => void }[] = [];

  constructor(startsAt = Date.parse("2026-11-16T08:00:00.000Z")) {
    this.nowMs = startsAt;
  }

  /** The simulated time. */
  now(): Date {
    return new Date(this.nowMs);
  }

  /** Moves the time forward and wakes every `wait` that is now over. */
  advance(ms: number): void {
    this.nowMs += ms;
    const due = this.sleepers.filter((sleeper) => sleeper.wakesAt <= this.nowMs);
    this.sleepers = this.sleepers.filter((sleeper) => sleeper.wakesAt > this.nowMs);
    for (const sleeper of due) sleeper.wake();
  }

  /** Resolves once `advance` has moved the time `ms` forward; at once for 0. */
  wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.sleepers.push({ wakesAt: this.nowMs + ms, wake: resolve });
    });
  }
}

/** What a {@link FakeTunnelProvider} reports and how it spends time. */
export interface FakeTunnelProviderOptions {
  /** The provider id in capabilities and the endpoint. Defaults to "fake". */
  id?: string;
  /** Whether the endpoint counts as public. Defaults to `false`. */
  public?: boolean;
  /** Whether the path counts as encrypted. Defaults to `true`. */
  encryptsPath?: boolean;
  /** Where `at` in each status and the latency come from. Defaults to a new {@link FakeTunnelTime}. */
  time?: FakeTunnelTime;
  /** Milliseconds of simulated time spent in `starting`, on a start and on a reconnect. Defaults to 0. */
  latencyMs?: number;
}

/** A stream of statuses with its own queue, so a slow reader never loses one. */
class StatusFeed implements AsyncIterableIterator<TunnelStatus> {
  private queued: TunnelStatus[] = [];
  private waiting: ((result: IteratorResult<TunnelStatus>) => void) | undefined;
  private ended = false;

  private readonly onLeave: (feed: StatusFeed) => void;

  constructor(onLeave: (feed: StatusFeed) => void) {
    this.onLeave = onLeave;
  }

  push(status: TunnelStatus): void {
    if (this.ended) return;
    if (this.waiting === undefined) {
      this.queued.push(status);
      return;
    }
    const resolve = this.waiting;
    this.waiting = undefined;
    resolve({ done: false, value: status });
  }

  /** Ends the stream after the statuses already queued. */
  end(): void {
    this.ended = true;
    if (this.waiting === undefined) return;
    const resolve = this.waiting;
    this.waiting = undefined;
    resolve({ done: true, value: undefined });
  }

  next(): Promise<IteratorResult<TunnelStatus>> {
    const status = this.queued.shift();
    if (status !== undefined) return Promise.resolve({ done: false, value: status });
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  /** The reader left early, with `break` or `return`. */
  return(): Promise<IteratorResult<TunnelStatus>> {
    this.ended = true;
    this.queued = [];
    this.onLeave(this);
    return Promise.resolve({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<TunnelStatus> {
    return this;
  }
}

/**
 * A {@link TunnelProvider} that lives in the process and touches no network,
 * so tunnel phases B and C can be tested without a real tunnel. It follows the
 * port to the letter, and `tunnelProviderContract` proves it.
 *
 * A test drives it from outside: `degrade`, `drop` and `recover` move it to a
 * state, `reconnect` takes it through `starting` again, `failNextStart` makes
 * the next start end `down`, and `latencyMs` with {@link FakeTunnelTime} makes
 * starting take simulated time. Its endpoint ends in `.invalid`, a name that
 * can never resolve, so a client that tries it fails and cannot reach a
 * stranger.
 *
 * @example
 * const time = new FakeTunnelTime();
 * const tunnel = new FakeTunnelProvider({ time, latencyMs: 500 });
 * const started = tunnel.start({ gateway: { host: "127.0.0.1", port: 4100 } });
 * time.advance(500);
 * const endpoint = await started;
 * tunnel.drop("offline");
 * await tunnel.reconnect();
 */
export class FakeTunnelProvider implements TunnelProvider {
  private readonly time: FakeTunnelTime;
  private readonly capabilitiesOf: TunnelCapabilities;
  private latencyMs: number;
  private current: TunnelStatus;
  private tunnel: { config: TunnelConfig; endpoint: TunnelEndpoint } | undefined;
  private coming: Promise<TunnelEndpoint> | undefined;
  private failure: TunnelReason | undefined;
  private readers = new Set<StatusFeed>();

  constructor(options: FakeTunnelProviderOptions = {}) {
    this.time = options.time ?? new FakeTunnelTime();
    this.latencyMs = options.latencyMs ?? 0;
    this.capabilitiesOf = {
      id: options.id ?? "fake",
      public: options.public ?? false,
      encryptsPath: options.encryptsPath ?? true,
    };
    this.current = { state: "down", reason: "stopped", at: this.stamp() };
  }

  /** The clock the fake stamps statuses with. */
  get clock(): Clock {
    return this.time;
  }

  capabilities(): Promise<TunnelCapabilities> {
    return Promise.resolve(this.capabilitiesOf);
  }

  async start(config: TunnelConfig): Promise<TunnelEndpoint> {
    assertTunnelConfig(config);
    if (this.tunnel === undefined) {
      this.tunnel = { config, endpoint: this.endpointFor(config) };
      return this.bringUp();
    }
    if (!sameGateway(this.tunnel.config, config)) {
      throw new RangeError("a tunnel is already up for another config; stop it first");
    }
    if (this.current.state === "down") return this.bringUp();
    return this.coming ?? this.tunnel.endpoint;
  }

  status(): AsyncIterable<TunnelStatus> {
    const feed = new StatusFeed((left) => this.readers.delete(left));
    feed.push(this.current);
    this.readers.add(feed);
    return feed;
  }

  stop(): Promise<void> {
    if (this.tunnel === undefined) return Promise.resolve();
    this.tunnel = undefined;
    this.publish({ state: "down", reason: "stopped", at: this.stamp() });
    for (const reader of this.readers) reader.end();
    this.readers.clear();
    return Promise.resolve();
  }

  /** The tunnel is up but struggling; clients should expect trouble. */
  degrade(reason: TunnelReason = "provider-error"): void {
    this.requireTunnel("degrade");
    this.publish({ state: "degraded", reason, at: this.stamp() });
  }

  /** The tunnel is lost, as when the network or the provider goes away. `reconnect` or `start` brings it back. */
  drop(reason: TunnelReason = "offline"): void {
    this.requireTunnel("drop");
    this.publish({ state: "down", reason, at: this.stamp() });
  }

  /** The tunnel is `ready` again at once, as when a degraded link heals. */
  recover(): void {
    this.requireTunnel("recover");
    this.publish({ state: "ready", at: this.stamp() });
  }

  /** Goes through `starting` and, after the latency, `ready`; resolves with the endpoint. */
  reconnect(): Promise<TunnelEndpoint> {
    this.requireTunnel("reconnect");
    return this.bringUp();
  }

  /** Makes the next start, or reconnect, end `down` with `reason` instead of `ready`. */
  failNextStart(reason: TunnelReason): void {
    this.failure = reason;
  }

  /** Changes how long starting takes, in simulated milliseconds. */
  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  private bringUp(): Promise<TunnelEndpoint> {
    const coming = this.runStart();
    this.coming = coming;
    const forget = () => {
      if (this.coming === coming) this.coming = undefined;
    };
    coming.then(forget, forget);
    return coming;
  }

  private async runStart(): Promise<TunnelEndpoint> {
    const tunnel = this.tunnel;
    if (tunnel === undefined) throw new Error("no tunnel to start");
    this.publish({ state: "starting", at: this.stamp() });
    await this.time.wait(this.latencyMs);
    const reason = this.failure;
    if (reason !== undefined) {
      this.failure = undefined;
      this.tunnel = undefined;
      this.publish({ state: "down", reason, at: this.stamp() });
      throw new Error(`the tunnel went down before it was ready: ${reason}`);
    }
    if (this.current.state !== "starting" || this.tunnel !== tunnel) {
      throw new Error(`the tunnel went ${this.current.state} before it was ready`);
    }
    this.publish({ state: "ready", at: this.stamp() });
    return tunnel.endpoint;
  }

  private publish(status: TunnelStatus): void {
    const before = this.current;
    const same =
      before.state === status.state &&
      ("reason" in before ? before.reason : undefined) ===
        ("reason" in status ? status.reason : undefined);
    if (same) return;
    this.current = status;
    for (const reader of this.readers) reader.push(status);
  }

  private endpointFor(config: TunnelConfig): TunnelEndpoint {
    return {
      providerId: this.capabilitiesOf.id,
      url: `https://gateway-${config.gateway.port}.fake-tunnel.invalid`,
      public: this.capabilitiesOf.public,
    };
  }

  private requireTunnel(action: string): void {
    if (this.tunnel === undefined) throw new Error(`cannot ${action}: no tunnel is up`);
  }

  private stamp(): string {
    return this.time.now().toISOString();
  }
}

function sameGateway(first: TunnelConfig, second: TunnelConfig): boolean {
  return first.gateway.host === second.gateway.host && first.gateway.port === second.gateway.port;
}
