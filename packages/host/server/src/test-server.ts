import type {
  Clock,
  Coordination,
  Lease,
  PasswordHasher,
  RunExecutor,
  RunStore,
  Secrets,
  WindowCount,
} from "@halonicjs/ports";
import type {
  ConnectorCallPorts,
  ErrorLog,
  GoogleSetupPorts,
  RequestCountStore,
  RequestLog,
  Server,
  ServerConfig,
  ServerPorts,
  TrustGate,
  WebhookRoutines,
} from "./api.ts";
import { createServer } from "./create-server.ts";

/** A port the test doesn't expect the server to touch: any call fails the test loudly. */
function unusedPort<Port extends object>(name: string): Port {
  return new Proxy(
    {},
    {
      get(_target, method) {
        throw new Error(`${name}.${String(method)} was called, but this test doesn't expect it`);
      },
    },
  ) as Port;
}

/** A clock a test moves by hand. */
export class TestClock implements Clock {
  #time = Date.parse("2026-11-12T10:00:00Z");
  now(): Date {
    return new Date(this.#time);
  }
  advance(ms: number): void {
    this.#time += ms;
  }
}

/** A hasher whose hash of `pw` is `hash:pw`, and that counts its checks. */
export class FakePasswordHasher implements PasswordHasher {
  verifyCalls = 0;
  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  }
  async verify(password: string, hash: string): Promise<boolean> {
    this.verifyCalls += 1;
    return hash === `hash:${password}`;
  }
  needsRehash(): boolean {
    return false;
  }
}

/** The values, windows and leases of `Coordination` that sign-in and webhooks use; the rest fails the test loudly. */
export class FakeCoordination implements Partial<Coordination> {
  readonly values = new Map<string, string>();
  readonly #windows = new Map<string, { start: number; count: number }>();
  readonly #clock: Clock;
  constructor(clock: Clock) {
    this.#clock = clock;
  }

  readonly leases = new Map<string, { token: string; until: number }>();
  async tryAcquire(key: string, ttlMs: number): Promise<Lease | null> {
    const now = this.#clock.now().getTime();
    const held = this.leases.get(key);
    if (held !== undefined && now < held.until) return null;
    const token = `token-${this.leases.size + 1}-${now}`;
    this.leases.set(key, { token, until: now + ttlMs });
    return { key, token, expiresAt: new Date(now + ttlMs).toISOString() };
  }
  async release(lease: Lease): Promise<void> {
    if (this.leases.get(lease.key)?.token === lease.token) this.leases.delete(lease.key);
  }
  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    if ((this.values.get(key) ?? null) !== expected) return false;
    if (next === null) this.values.delete(key);
    else this.values.set(key, next);
    return true;
  }
  async countInWindow(key: string, windowMs: number, limit: number): Promise<WindowCount> {
    const now = this.#clock.now().getTime();
    const open = this.#windows.get(key);
    const window =
      open !== undefined && now < open.start + windowMs ? open : { start: now, count: 0 };
    const resetAt = new Date(window.start + windowMs).toISOString();
    if (window.count >= limit) return { allowed: false, count: limit, resetAt };
    this.#windows.set(key, { start: window.start, count: window.count + 1 });
    return { allowed: true, count: window.count + 1, resetAt };
  }
}

/** A server built from fakes, for tests. `passwordHash` null means no password is configured. */
export function testServer(options: {
  passwordHash: string | null;
  config?: Partial<ServerConfig>;
  secrets?: Secrets;
  errorLog?: ErrorLog;
  clock?: Clock;
  passwordHasher?: PasswordHasher;
  coordination?: Coordination;
  requestCounts?: RequestCountStore;
  runs?: RunExecutor;
  runStore?: Pick<RunStore, "list" | "get">;
  trust?: TrustGate;
  webhooks?: WebhookRoutines;
  google?: GoogleSetupPorts;
  connectors?: ConnectorCallPorts;
  requestLog?: RequestLog;
}): Server {
  const clock = options.clock ?? new TestClock();
  const ports: ServerPorts = {
    runs: options.runs ?? unusedPort("runs"),
    runStore: options.runStore ?? { list: async () => [], get: async () => null },
    trust: options.trust ?? unusedPort("trust"),
    secrets: options.secrets ?? {
      get: async (name) => (name === "serve-password" ? options.passwordHash : null),
    },
    passwordHasher: options.passwordHasher ?? unusedPort("passwordHasher"),
    coordination: options.coordination ?? unusedPort("coordination"),
    webhooks: options.webhooks ?? { find: async () => null },
    requestCounts: options.requestCounts ?? unusedPort("requestCounts"),
    errorLog: options.errorLog ?? { record: () => {} },
    ...(options.google === undefined ? {} : { google: options.google }),
    ...(options.connectors === undefined ? {} : { connectors: options.connectors }),
    ...(options.requestLog === undefined ? {} : { requestLog: options.requestLog }),
    clock,
    ids: { next: (prefix) => `${prefix}_1` },
  };
  const config: ServerConfig = {
    deploymentId: "acme",
    version: "0.1.0",
    minAppVersion: "0.1.0",
    allowedHosts: ["halonic.acme.example"],
    maxBodyBytes: 1024,
    ...options.config,
  };
  return createServer({ config, ports });
}
