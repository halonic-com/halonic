import type {
  Clock,
  Coordination,
  IdGenerator,
  PasswordHasher,
  RunExecutor,
  Secrets,
} from "@halonicjs/ports";
import type { PlacedRoutine } from "@halonicjs/routines";

/**
 * The `Request → Response` handler behind `halonic serve` and a cloud Worker.
 * It uses only Web-standard types, so the same handler runs on Node and on a
 * Worker. Everything that touches the outside world comes in through
 * {@link ServerPorts}, and nothing is kept in module-level memory.
 */
export interface Server {
  /**
   * Answers one request. `context` is what the host knows about the
   * connection and can vouch for; the server never reads it from a header.
   * It never throws for a request it can't serve: a refused or failed
   * request gets a {@link ServerErrorBody} with the right status. A request
   * that goes over the daily ceiling is refused here, before routing, and
   * never starts a run.
   */
  handle(request: Request, context?: RequestContext): Promise<Response>;
}

/**
 * Facts about one connection that only the host can vouch for: the socket
 * address on Node, `CF-Connecting-IP` on Cloudflare. A host must never fill
 * these from a header the client sets, such as `X-Forwarded-For`.
 */
export interface RequestContext {
  /** The client's address. When absent, the login limit counts the whole server only. */
  readonly clientAddress?: string;
  /**
   * Whether the client reached the host over HTTPS, also when a proxy ended
   * TLS in front of it. When absent, the scheme of the request URL decides.
   */
  readonly secure?: boolean;
}

/** The body of every error the server sends: a code and a short message, never a stack, path or secret. */
export interface ServerErrorBody {
  /** A stable word a client can switch on, such as `host_not_allowed`. */
  readonly code: string;
  /** One short sentence for a person. */
  readonly message: string;
}

/**
 * Counts requests per deployment and UTC day, for `limits.dailyRequests`.
 * Each host supplies one that survives a restart: `targets/node/runtime` keeps
 * it on disk, the Cloudflare target in its own durable store. The count is
 * atomic, so parallel requests never get past the ceiling. It is its own
 * port, not a `Coordination.increment` counter, so a host can back the count
 * of every request with a store of its own choice, apart from the shared
 * login limits and sessions.
 */
export interface RequestCountStore {
  /**
   * Counts one request for `day` unless `limit` requests were already
   * counted for it.
   *
   * @param day The UTC day as `YYYY-MM-DD`.
   * @param limit The ceiling; the count never goes above it.
   * @returns whether the request is within the ceiling, and the count after the call
   */
  countRequest(day: string, limit: number): Promise<{ allowed: boolean; count: number }>;
}

/** What a host decides before it starts the server. None of it is a secret. */
export interface ServerConfig {
  /** The deployment's id in `deployments.yaml`, so each deployment has its own count. */
  readonly deploymentId: string;
  /** The server's version, as `GET /api/hello` reports it. */
  readonly version: string;
  /** The oldest Android app this server works with, as `GET /api/hello` reports it. */
  readonly minAppVersion: string;
  /**
   * The `Host` names the server answers to. Letter case doesn't matter: the
   * server compares them lowercased. A name has no port, unless the host
   * listens on a fixed port, and then it includes it. A request with any other
   * `Host` is refused. A server with no password accepts only loopback names,
   * whatever this holds.
   */
  readonly allowedHosts: readonly string[];
  /** The deployment's `limits.dailyRequests`. No ceiling when absent. */
  readonly dailyRequests?: number;
  /** The most bytes a request body may have; the limit is enforced while the body streams. */
  readonly maxBodyBytes: number;
}

/** Whether the workspace may start programs on this computer, as a person last decided. */
export type TrustState = "trusted" | "new" | "changed" | "unreadable" | "refused";

/** What the trust check found about the workspace the server runs. */
export interface TrustDecision {
  readonly state: TrustState;
  /** One short sentence for a person, such as what changed since the workspace was trusted. */
  readonly message: string;
}

/**
 * The host's trust check for the workspace the server runs. It is read-only on
 * purpose: only a person at the computer grants trust, with `halonic trust`,
 * so the server has no call to grant it and no way to update a record.
 * It checks the workspace as it is now, every time, and never from memory.
 */
export interface TrustGate {
  check(): Promise<TrustDecision>;
}

/**
 * The routines a webhook may start. The host loads them from the workspace
 * the server runs, at every request, so an edited or disabled routine counts
 * at once.
 */
export interface WebhookRoutines {
  /**
   * The routine at a webhook address, or `null` when there is none.
   *
   * @param key The routine's key as `routineKey` writes it: `<hubId>/<routineId>` or `@workspace/<routineId>`.
   */
  find(key: string): Promise<PlacedRoutine | null>;
}

/** Records the cause of an unexpected failure, so an operator can find it. It must not throw. */
export interface ErrorLog {
  record(error: unknown): void;
}

/** What the server needs from its host. Every port is replaceable, so a test runs the handler with fakes. */
export interface ServerPorts {
  /** Runs workflows; the server only forwards start, send, cancel and subscribe calls to it. */
  readonly runs: RunExecutor;
  /** Configured secrets, such as the sign-in password hash and webhook secrets. Read-only. */
  readonly secrets: Secrets;
  /** Hashes and checks the sign-in password. The target picks the format. */
  readonly passwordHasher: PasswordHasher;
  /** Shared login limits and session records, so every instance of a deployment agrees. */
  readonly coordination: Coordination;
  /** The trust check: every route that starts a run asks it first. */
  readonly trust: TrustGate;
  /** The routines with a webhook trigger; `POST /api/webhooks/<hub>/<routine>` starts one. */
  readonly webhooks: WebhookRoutines;
  /** The daily request counter. */
  readonly requestCounts: RequestCountStore;
  /** Where the cause of an unexpected failure goes. The reply to the caller never carries it. */
  readonly errorLog: ErrorLog;
  /** The time; replaced in tests to cross a UTC day. */
  readonly clock: Clock;
  /**
   * Request ids only. They are not secret and tests make them predictable, so
   * session tokens must not come from here: they use `crypto.getRandomValues`.
   */
  readonly ids: IdGenerator;
}

/** Everything {@link createServer} needs. */
export interface ServerOptions {
  readonly config: ServerConfig;
  readonly ports: ServerPorts;
}

/**
 * Builds the server from its config and ports.
 *
 * @throws RangeError when the config is unusable, such as an empty
 *   `allowedHosts` or a `dailyRequests` that isn't a whole number above zero
 */
export type CreateServer = (options: ServerOptions) => Server;
