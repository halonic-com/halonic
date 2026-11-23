// The engine's own refusal when another engine holds the workspace's lock.
// Its callers word it for their people (the CLI names the command that holds
// it, HAL-14299), so it has a type of its own: a `LockHeldError` from any
// other lock, such as one a harness sandbox takes, can never pass for it.

import type { LockHeldError } from "@halonicjs/adapter-fs-node";

/** Says that another engine on this computer holds the workspace's engine lock. */
export class EngineLockHeldError extends Error {
  /** The holder's record, or `null` when the lock file holds none yet. */
  readonly holder: LockHeldError["holder"];

  constructor(cause: LockHeldError) {
    super(cause.message, { cause });
    this.name = "EngineLockHeldError";
    this.holder = cause.holder;
  }
}
