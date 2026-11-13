/**
 * Stands in for `cloudflare:workers` when Node runs the Durable Object
 * classes' tests (see `vitest.config.ts`). It has only what the classes use
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
