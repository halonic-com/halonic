/**
 * The part of `node:inspector` that `coverage-start.ts` uses. workerd's own
 * `Session` talks to the Worker's V8 inspector when the Worker is built for coverage
 * (the `enable_nodejs_inspector_local_dev` flag); `@cloudflare/workers-types` doesn't know the module.
 */
declare module "node:inspector" {
  export class Session {
    connect(): void;
    post(
      method: string,
      params: object | undefined,
      callback: (error: Error | null, result?: unknown) => void,
    ): void;
  }
}
