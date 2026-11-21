/**
 * Stands in for `cloudflare:workers` when Node runs the Worker's wiring tests
 * (see `vitest.config.ts`). It has only what the Durable Object classes use
 * of `DurableObject`: they keep `ctx` and `env`.
 */
export class DurableObject<Env = unknown> {
  readonly ctx: unknown;
  readonly env: Env;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
