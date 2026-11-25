// The harness bridge on the Worker (requirement `runtime.worker-bridge`). A harness step runs in
// its run object's alarm, so the run's open bridge lives in that object for as long as the call
// lasts. The program in the run's container calls the bridge by name; the container's outbound
// intercept hands the request to the run object, which answers it here.

import {
  type RunCredentialBinding,
  type RunCredentials,
  WebHarnessBridge,
  type WebHarnessBridgeOptions,
} from "@halonicjs/adapter-harness-bridge/web";
import {
  bridgeKeyProviders,
  type Clock,
  type HarnessBridgeOptions,
  type HarnessBridgeServer,
  type OpenHarnessBridge,
} from "@halonicjs/ports";

/**
 * The name the program calls the bridge by, as the Node bridge's socket name: the `.invalid`
 * top-level domain never resolves, so only the container's intercept can answer it.
 */
export const workerBridgeName = "bridge.halonic.invalid";

/** What a {@link WorkerBridgeServer} needs. */
export interface WorkerBridgeServerOptions
  extends Omit<WebHarnessBridgeOptions<RunCredentialBinding>, "credentials"> {
  /** The run object's credentials: one per run, kept as a hash in the object's storage. */
  readonly credentials: RunCredentials<RunCredentialBinding>;
  readonly clock: Clock;
  /**
   * How long a run's credential lasts from the bridge's opening, in milliseconds: the run
   * container's time cap, so the credential is dead once the container must be.
   */
  readonly lifetimeMs: number;
}

/** What {@link WorkerBridgeServer.serve} gives the bridge besides the request. */
export interface WorkerBridgeRequest {
  /** The run the request reached: the run id the container object is named after, never one the request names. */
  readonly runId: string;
  /** Keeps the Worker alive for work after the reply, such as a streamed call's spend. */
  waitUntil(work: Promise<void>): void;
}

/** One run's open bridge: what the engine gave it, and how its requests are stopped. */
interface OpenRun {
  readonly options: HarnessBridgeOptions;
  readonly stop: AbortController;
}

/**
 * The `HarnessBridgeServer` port on the Worker, for the host's `LocalBridgeHost`. `open` gives the
 * run a new credential, which reaches the program in the container's start environment, never as
 * an argument. `close` stops the run's requests and revokes the credential, so it works for no
 * later request even before it expires.
 *
 * @example
 * const server = new WorkerBridgeServer({ credentials, clock, lifetimeMs, secrets, fetch });
 * const bridge = await server.open(options);
 * const reply = await server.serve(request, { runId, waitUntil: (work) => ctx.waitUntil(work) });
 */
export class WorkerBridgeServer implements HarnessBridgeServer {
  readonly #credentials: RunCredentials<RunCredentialBinding>;
  readonly #clock: Clock;
  readonly #lifetimeMs: number;
  readonly #bridge: WebHarnessBridge<RunCredentialBinding>;
  readonly #open = new Map<string, OpenRun>();

  constructor(options: WorkerBridgeServerOptions) {
    this.#credentials = options.credentials;
    this.#clock = options.clock;
    this.#lifetimeMs = options.lifetimeMs;
    this.#bridge = new WebHarnessBridge(options);
  }

  /**
   * @throws Error when the run's bridge is already open here, or the run had a credential before:
   *   a run gets one credential, once
   */
  async open(options: HarnessBridgeOptions): Promise<OpenHarnessBridge> {
    const { runId } = options;
    if (this.#open.has(runId)) {
      throw new Error(`Run ${runId}'s bridge is already open.`);
    }
    const expiresAt = this.#clock.now().getTime() + this.#lifetimeMs;
    const token = await this.#credentials.issue({ runId, expiresAt });
    const stop = new AbortController();
    const signals = options.signal === undefined ? [stop.signal] : [stop.signal, options.signal];
    this.#open.set(runId, { options: { ...options, signal: AbortSignal.any(signals) }, stop });
    const keyProviders = bridgeKeyProviders(options.providers);
    return {
      url: `http://${workerBridgeName}`,
      token,
      ...(keyProviders.length === 0 ? {} : { keyProviders }),
      close: () => this.#close(runId),
    };
  }

  /**
   * Answers one request the run's container sent the bridge. A run whose bridge isn't open here
   * gets 401, as a request with a wrong credential does.
   */
  serve(request: Request, exchange: WorkerBridgeRequest): Promise<Response> {
    const open = this.#open.get(exchange.runId);
    if (open === undefined) {
      return Promise.resolve(
        new Response("The request doesn't carry this run's bridge credential.", { status: 401 }),
      );
    }
    return this.#bridge.handle(request, { run: open.options, waitUntil: exchange.waitUntil });
  }

  /**
   * Revokes the run's credential without the engine closing its bridge: the container's alarm
   * calls it when it stops a run at its time limit, so the credential dies with the container.
   */
  revoke(runId: string): Promise<void> {
    return this.#close(runId);
  }

  /** Stops the run's requests in flight and revokes its credential. Safe to call twice. */
  async #close(runId: string): Promise<void> {
    const open = this.#open.get(runId);
    this.#open.delete(runId);
    open?.stop.abort(new Error(`Run ${runId}'s bridge is closed.`));
    await this.#credentials.revoke(runId);
  }
}
