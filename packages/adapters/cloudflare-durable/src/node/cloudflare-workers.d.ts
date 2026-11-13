// Types for the Node tests of the Durable Object classes, which workerd's own
// types (used for everything else in this package) don't cover. The stub next
// to this file is what runs.

declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    readonly ctx: DurableObjectState;
    readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
    alarm?(): void | Promise<void>;
  }
}

/** What the classes read of the object's state: only its storage. */
interface DurableObjectState {
  readonly storage: {
    readonly sql: {
      exec<T extends Record<string, string | number | null | ArrayBuffer>>(
        query: string,
        ...bindings: (string | number | null | ArrayBuffer)[]
      ): { toArray(): T[] };
    };
    transactionSync<T>(change: () => T): T;
    setAlarm(atMs: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
}

declare namespace Cloudflare {
  // biome-ignore lint/suspicious/noEmptyInterface: the Worker's own bindings are declared where they are used.
  interface Env {}
}
