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
import { AsyncFeed } from "@halonicjs/std";
import { endpointUrl, readNodeState, readServePort, tailscaleCommands } from "./tailscale-cli.ts";
import type { TailscaleReply, TailscaleRunner } from "./tailscale-runner.ts";

/** What a {@link TailscaleTunnel} is given. */
export interface TailscaleTunnelOptions {
  /** Runs the `tailscale` command; `nodeTailscaleRunner()` in the executable, a scripted one in tests. */
  runner: TailscaleRunner;
  /** The tailnet HTTPS port the gateway is served on. Defaults to 8443, so the person's own 443 stays theirs. */
  servePort?: number;
  /** Where `at` in each status comes from. Defaults to the system clock. */
  clock?: Clock;
}

const capabilities: TunnelCapabilities = { id: "tailscale", public: false, encryptsPath: true };

const systemClock: Clock = { now: () => new Date() };

/** A start that is under way or done, and the config it was given. */
interface Tunnel {
  readonly config: TunnelConfig;
  readonly coming: Promise<TunnelEndpoint>;
}

/**
 * The Tailscale {@link TunnelProvider}: serves the remote gateway on the
 * person's own tailnet with `tailscale serve`, over HTTPS on `servePort`,
 * and never with Funnel, so it is not public (requirement
 * `tunnel-tailscale.provider`). It never signs in: a node that isn't signed
 * in is `signed-out`. It refuses a port that already has a serve entry or
 * Funnel, and on `stop` removes only the entry it added itself.
 *
 * @example
 * const tunnel = new TailscaleTunnel({ runner: nodeTailscaleRunner() });
 * const endpoint = await tunnel.start({ gateway: { host: "127.0.0.1", port: 4100 } });
 */
export class TailscaleTunnel implements TunnelProvider {
  readonly #runner: TailscaleRunner;
  readonly #servePort: number;
  readonly #clock: Clock;
  readonly #readers = new Set<AsyncFeed<TunnelStatus>>();
  #current: TunnelStatus;
  #tunnel: Tunnel | undefined;
  /** Counts starts and stops, so a start that a stop overtook knows it lost. */
  #run = 0;
  /** Whether the serve entry on `servePort` is ours, so `stop` removes it. */
  #added = false;

  constructor(options: TailscaleTunnelOptions) {
    this.#runner = options.runner;
    this.#servePort = options.servePort ?? 8443;
    this.#clock = options.clock ?? systemClock;
    this.#current = { state: "down", reason: "stopped", at: this.#stamp() };
  }

  capabilities(): Promise<TunnelCapabilities> {
    return Promise.resolve(capabilities);
  }

  start(config: TunnelConfig): Promise<TunnelEndpoint> {
    try {
      assertTunnelConfig(config);
    } catch (error) {
      return Promise.reject(error);
    }
    const tunnel = this.#tunnel;
    if (tunnel !== undefined) {
      if (sameConfig(tunnel.config, config)) return tunnel.coming;
      return Promise.reject(new RangeError("a Tailscale tunnel is already up for another port"));
    }
    this.#run += 1;
    const coming = this.#bringUp(config, this.#run);
    this.#tunnel = { config, coming };
    return coming;
  }

  status(): AsyncIterable<TunnelStatus> {
    const feed = new AsyncFeed<TunnelStatus>((left) => this.#readers.delete(left));
    feed.push(this.#current);
    this.#readers.add(feed);
    return feed;
  }

  async stop(): Promise<void> {
    this.#run += 1;
    this.#tunnel = undefined;
    const removal = this.#added ? this.#removeEntry() : Promise.resolve(undefined);
    this.#added = false;
    const failure = await removal;
    this.#report("down", "stopped");
    for (const reader of this.#readers) reader.end();
    this.#readers.clear();
    if (failure !== undefined) throw new Error(failure);
  }

  async #bringUp(config: TunnelConfig, run: number): Promise<TunnelEndpoint> {
    this.#report("starting");
    const node = await this.#runner.run(tailscaleCommands.status());
    const nodeState =
      node.kind === "done" && node.code === 0 ? readNodeState(node.stdout) : undefined;
    if (nodeState === undefined) return this.#fail(run, reasonFor(node, "offline"));
    if (!nodeState.usable) return this.#fail(run, nodeState.reason);
    this.#assertCurrent(run);
    const serve = await this.#runner.run(tailscaleCommands.serveStatus());
    if (serve.kind !== "done" || serve.code !== 0) return this.#fail(run, reasonFor(serve));
    const port = readServePort(serve.stdout, nodeState.dnsName, this.#servePort);
    if (!port.free) return this.#fail(run, port.reason);
    this.#assertCurrent(run);
    const added = await this.#runner.run(tailscaleCommands.serveAdd(this.#servePort, config));
    if (added.kind !== "done" || added.code !== 0) return this.#fail(run, reasonFor(added));
    if (run !== this.#run) {
      // A stop came while the entry was being added: take it away again.
      const failure = await this.#removeEntry();
      throw new Error(
        `the Tailscale tunnel was stopped before it was ready${failure ? `; ${failure}` : ""}`,
      );
    }
    this.#added = true;
    this.#report("ready");
    const url = endpointUrl(nodeState.dnsName, this.#servePort);
    return { providerId: capabilities.id, url, public: capabilities.public };
  }

  /** Removes the serve entry on `servePort`; says why when that failed. */
  async #removeEntry(): Promise<string | undefined> {
    const reply = await this.#runner.run(tailscaleCommands.serveRemove(this.#servePort));
    if (reply.kind === "done" && reply.code === 0) return undefined;
    return `the Tailscale serve entry on port ${this.#servePort} couldn't be removed: ${describe(reply)}`;
  }

  #assertCurrent(run: number): void {
    if (run !== this.#run) throw new Error("the Tailscale tunnel was stopped before it was ready");
  }

  #fail(run: number, reason: TunnelReason): never {
    this.#assertCurrent(run);
    this.#tunnel = undefined;
    this.#report("down", reason);
    throw new Error(`the Tailscale tunnel went down before it was ready: ${reason}`);
  }

  #report(state: "starting" | "ready"): void;
  #report(state: "degraded" | "down", reason: TunnelReason): void;
  #report(state: TunnelStatus["state"], reason?: TunnelReason): void {
    const before = this.#current;
    const beforeReason = "reason" in before ? before.reason : undefined;
    if (before.state === state && beforeReason === reason) return;
    const at = this.#stamp();
    this.#current =
      state === "starting" || state === "ready"
        ? { state, at }
        : { state, reason: reason ?? "provider-error", at };
    for (const reader of this.#readers) reader.push(this.#current);
  }

  #stamp(): string {
    return this.#clock.now().toISOString();
  }
}

function sameConfig(first: TunnelConfig, second: TunnelConfig): boolean {
  return first.gateway.host === second.gateway.host && first.gateway.port === second.gateway.port;
}

/**
 * Why a call that didn't succeed leaves the tunnel down: no program, a call
 * that hung or couldn't run, or `onExit` when it exited with an error. A
 * `status` that exits with an error almost always means tailscaled isn't running.
 */
function reasonFor(reply: TailscaleReply, onExit: TunnelReason = "provider-error"): TunnelReason {
  if (reply.kind === "missing") return "not-installed";
  if (reply.kind === "failed") return "provider-error";
  return onExit;
}

function describe(reply: TailscaleReply): string {
  if (reply.kind === "missing") return "tailscale is no longer installed";
  if (reply.kind === "failed") return reply.why;
  return `tailscale exited with code ${reply.code}`;
}
