import type {
  Clock,
  Coordination,
  PasswordHasher,
  RunExecutor,
  Secrets,
  WindowCount,
} from "@halonicjs/ports";
import type {
  ErrorLog,
  RequestCountStore,
  Server,
  ServerConfig,
  ServerPorts,
  TrustGate,
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

/** The values and windows of `Coordination` that sign-in uses; the rest fails the test loudly. */
export class FakeCoordination implements Partial<Coordination> {
  readonly values = new Map<string, string>();
  readonly #windows = new Map<string, { start: number; count: number }>();
  readonly #clock: Clock;
  constructor(clock: Clock) {
    this.#clock = clock;
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
  trust?: TrustGate;
}): Server {
  const clock = options.clock ?? new TestClock();
  const ports: ServerPorts = {
    runs: options.runs ?? unusedPort("runs"),
    trust: options.trust ?? unusedPort("trust"),
    secrets: options.secrets ?? {
      get: async (name) => (name === "serve-password" ? options.passwordHash : null),
    },
    passwordHasher: options.passwordHasher ?? unusedPort("passwordHasher"),
    coordination: options.coordination ?? unusedPort("coordination"),
    requestCounts: options.requestCounts ?? unusedPort("requestCounts"),
    errorLog: options.errorLog ?? { record: () => {} },
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
