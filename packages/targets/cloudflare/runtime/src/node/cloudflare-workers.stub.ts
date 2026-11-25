/**
 * Stands in for `cloudflare:workers` when Node runs the Worker's wiring tests
 * (see `vitest.config.ts`). It has only what the Durable Object classes use
 * of `DurableObject` and `WorkerEntrypoint`: they keep `ctx` and `env`.
 */
export class DurableObject<Env = unknown> {
  readonly ctx: unknown;
  readonly env: Env;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

/** Stands in for `WorkerEntrypoint`, as {@link DurableObject} does for its class. */
export class WorkerEntrypoint<Env = unknown> {
  readonly ctx: unknown;
  readonly env: Env;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
